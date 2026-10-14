import { expect } from 'chai';
import { BigNumber, Contract, Signer } from 'ethers';
import { readFileSync } from 'fs';
import hre, { deployments, ethers, network } from 'hardhat';
import { resolve } from 'path';

import simulateDeployment from '../../deploy/simulation';
import { DeploymentStorage } from '../../utils/deployment';
import { toBytes32 } from '../../utils/strings';

type Side = 'LEND' | 'BORROW';

interface ResidualOrderInput {
  orderId: string;
  unitPrice: string;
  maker: string;
  amount: string;
}

interface ResidualTreeInput {
  currency: string;
  orderBookId: string;
  maturity: string;
  side: Side;
  expectedRoot: string;
  orders: ResidualOrderInput[];
}

interface IncidentFillReversalInput {
  recoveryId: string;
  sourceTransactionHash: string;
  currency: string;
  maturity: string;
  orderId: string;
  taker: string;
  maker: string;
  originalTakerSide: Side;
  amount: string;
  amountInFV: string;
  expectedTakerDeposit: string;
  expectedTakerFutureValue: string;
  expectedMakerDeposit: string;
  expectedMakerFutureValue: string;
}

interface IncidentRecoveryData {
  version: 1;
  network: string;
  chainId: string;
  referenceBlock: string;
  residualTrees: ResidualTreeInput[];
  incidentFillReversal: IncidentFillReversalInput | null;
}

interface AccountState {
  deposit: BigNumber;
  futureValue: BigNumber;
}

interface TreeContext {
  input: ResidualTreeInput;
  ccy: string;
  market: Contract;
  pendingBefore: BigNumber;
  oppositeBookBefore: string;
}

const runForkTest = process.env.RUN_RECOVERY_FORK_TEST === 'true';
const describeFork = runForkTest ? describe : describe.skip;
const STORAGE_SLOT = BigNumber.from(
  ethers.utils.keccak256(ethers.utils.toUtf8Bytes('sf.storage.lendingMarket')),
).sub(1);

const sideValue = (side: Side) => (side === 'LEND' ? 0 : 1);

const mappingSlot = (key: BigNumber | number | string, slot: BigNumber) =>
  ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [key, slot]),
  );

const getTreeRoot = async (
  market: string,
  orderBookId: string,
  maturity: string,
  side: Side,
) => {
  // LendingMarketStorage.Storage.orderBooks is slot +4. Inside OrderBook,
  // lendOrders and borrowOrders are slots +11 and +12 respectively.
  const orderBookSlot = BigNumber.from(
    mappingSlot(orderBookId, STORAGE_SLOT.add(4)),
  );
  const treeSlot = mappingSlot(
    maturity,
    orderBookSlot.add(side === 'LEND' ? 11 : 12),
  );
  return BigNumber.from(await ethers.provider.getStorageAt(market, treeSlot));
};

const serializeBook = (book: any) =>
  JSON.stringify({
    unitPrices: book.unitPrices.map((value: BigNumber) => value.toString()),
    amounts: book.amounts.map((value: BigNumber) => value.toString()),
    quantities: book.quantities.map((value: BigNumber) => value.toString()),
    next: book.next.toString(),
  });

describeFork('Fork Test: Order Book Incident Residual Recovery', function () {
  const impersonatedAccounts = new Set<string>();
  const originalFillRecoveryAddress =
    process.env.INCIDENT_FILL_RECOVERY_ADDRESS;
  const originalSafeWalletAddress = process.env.SAFE_WALLET_ADDRESS;
  let data: IncidentRecoveryData;
  let controller: Contract;
  let tokenVault: Contract;
  let recoveryOwner: Signer;
  let fillRecovery: Contract | undefined;

  const sendWithFallback = async (
    methods: string[],
    params: unknown[],
  ): Promise<void> => {
    let lastError: unknown;
    for (const method of methods) {
      try {
        await network.provider.send(method, params);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  const setBalance = async (account: string) =>
    sendWithFallback(
      ['hardhat_setBalance', 'anvil_setBalance'],
      [account, ethers.utils.hexValue(ethers.utils.parseEther('1000'))],
    );

  const impersonate = async (account: string): Promise<Signer> => {
    const normalized = ethers.utils.getAddress(account);
    await sendWithFallback(
      ['hardhat_impersonateAccount', 'anvil_impersonateAccount'],
      [normalized],
    );
    await setBalance(normalized);
    impersonatedAccounts.add(normalized);
    return ethers.provider.getSigner(normalized);
  };

  const addOperator = async (
    contract: Contract,
    ownerSigner: Signer,
    account: string,
  ) => {
    const role = await contract.OPERATOR_ROLE();
    if (!(await contract.hasRole(role, account))) {
      await contract
        .connect(ownerSigner)
        .addOperator(account)
        .then((transaction: any) => transaction.wait());
    }
  };

  const getAccountState = async (
    user: string,
    ccy: string,
    maturity: string,
  ): Promise<AccountState> => {
    const [, futureValue] = await controller.getPosition(ccy, maturity, user);
    return {
      deposit: await tokenVault.getDepositAmount(user, ccy),
      futureValue,
    };
  };

  before(async function () {
    this.timeout(0);
    data = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'recovery-data',
          network.name,
          'order-book-incident-residual.json',
        ),
        'utf8',
      ),
    ) as IncidentRecoveryData;

    const connectedNetwork = await ethers.provider.getNetwork();
    expect(data.version).to.equal(1);
    expect(data.network).to.equal(network.name);
    expect(data.chainId).to.equal(connectedNetwork.chainId.toString());
    expect(await ethers.provider.getBlockNumber()).to.be.gte(
      Number(data.referenceBlock),
    );

    const [deployer] = await ethers.getSigners();
    if (!deployer) {
      throw new Error('The fork node must expose a local execution account');
    }

    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));
    const [controllerAddress, tokenVaultAddress, beaconControllerAddress] =
      await Promise.all([
        proxyController.getAddress(toBytes32('LendingMarketController')),
        proxyController.getAddress(toBytes32('TokenVault')),
        proxyController.getAddress(toBytes32('BeaconProxyController')),
      ]);
    controller = await ethers.getContractAt(
      'LendingMarketController',
      controllerAddress,
    );
    tokenVault = await ethers.getContractAt('TokenVault', tokenVaultAddress);
    const beaconController = await ethers.getContractAt(
      'BeaconProxyController',
      beaconControllerAddress,
    );
    const firstTree = data.residualTrees[0];
    const firstMarket = await controller
      .getLendingMarket(toBytes32(firstTree.currency))
      .then((address: string) =>
        ethers.getContractAt('LendingMarket', address),
      );
    const [upgradeOwner, beaconUpgradeOwner] = await Promise.all([
      proxyController.owner(),
      beaconController.owner(),
    ]);
    expect(ethers.utils.getAddress(beaconUpgradeOwner)).to.equal(
      ethers.utils.getAddress(upgradeOwner),
    );
    await impersonate(upgradeOwner);

    const deploymentEnvironment: Record<string, string> = {
      MARKET_BASE_PERIOD: (await controller.getMarketBasePeriod()).toString(),
      MINIMUM_RELIABLE_AMOUNT: (
        await firstMarket.minimumReliableAmountInBaseCurrency()
      ).toString(),
      RECOVERY_ENABLED: 'true',
      RECOVERY_OWNER_ADDRESS: upgradeOwner,
      SAFE_WALLET_ADDRESS: upgradeOwner,
      ENABLE_AUTO_UPDATE: 'false',
    };
    const previousEnvironment = new Map<string, string | undefined>();
    DeploymentStorage.instance.clear();
    for (const [key, value] of Object.entries(deploymentEnvironment)) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    try {
      const tags = [
        'LendingMarketController',
        'LendingMarkets',
        ...(data.incidentFillReversal ? ['OrderBookIncidentFillRecovery'] : []),
      ].join(',');
      await hre.run('deploy', { tags, noCompile: true, write: false });
      await simulateDeployment(hre);
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    const [controllerOwner, tokenVaultOwner] = await Promise.all([
      controller.owner(),
      tokenVault.owner(),
    ]);
    const controllerOwnerSigner = await impersonate(controllerOwner);
    recoveryOwner = controllerOwnerSigner;
    expect(ethers.utils.getAddress(controllerOwner)).to.equal(
      ethers.utils.getAddress(upgradeOwner),
    );
    process.env.SAFE_WALLET_ADDRESS = controllerOwner;

    if (data.incidentFillReversal) {
      const tokenVaultOwnerSigner = await impersonate(tokenVaultOwner);
      const deployedFillRecovery = await deployments
        .get('OrderBookIncidentFillRecovery')
        .then(({ address }) =>
          ethers.getContractAt('OrderBookIncidentFillRecovery', address),
        );
      fillRecovery = deployedFillRecovery;
      process.env.INCIDENT_FILL_RECOVERY_ADDRESS = deployedFillRecovery.address;
      expect(
        ethers.utils.getAddress(await deployedFillRecovery.owner()),
      ).to.equal(ethers.utils.getAddress(controllerOwner));
      await addOperator(
        controller,
        controllerOwnerSigner,
        deployedFillRecovery.address,
      );
      await addOperator(
        tokenVault,
        tokenVaultOwnerSigner,
        deployedFillRecovery.address,
      );
    }

    const controllerDeployment = await deployments.get(
      'LendingMarketController',
    );
    const controllerProxy = await ethers.getContractAt(
      'UpgradeabilityProxy',
      controllerAddress,
    );
    expect(await controllerProxy.implementation()).to.equal(
      controllerDeployment.implementation ?? controllerDeployment.address,
    );
    const lendingMarketDeployment = await deployments.get('LendingMarket');
    const lendingMarketBeacon = await beaconController
      .getBeaconProxyAddress(toBytes32('LendingMarket'))
      .then((address: string) =>
        ethers.getContractAt('UpgradeableBeacon', address),
      );
    expect(await lendingMarketBeacon.implementation()).to.equal(
      lendingMarketDeployment.implementation ?? lendingMarketDeployment.address,
    );
  });

  after(async () => {
    DeploymentStorage.instance.clear();
    if (originalFillRecoveryAddress === undefined) {
      delete process.env.INCIDENT_FILL_RECOVERY_ADDRESS;
    } else {
      process.env.INCIDENT_FILL_RECOVERY_ADDRESS = originalFillRecoveryAddress;
    }
    if (originalSafeWalletAddress === undefined) {
      delete process.env.SAFE_WALLET_ADDRESS;
    } else {
      process.env.SAFE_WALLET_ADDRESS = originalSafeWalletAddress;
    }
    for (const account of impersonatedAccounts) {
      try {
        await sendWithFallback(
          [
            'hardhat_stopImpersonatingAccount',
            'anvil_stopImpersonatingAccount',
          ],
          [account],
        );
      } catch {
        // The disposable fork may already have stopped after a failed test.
      }
    }
  });

  it('executes the chain manifest and preserves unrelated accounting state', async function () {
    this.timeout(0);

    const treeContexts: TreeContext[] = [];
    const accountStatesBefore = new Map<string, AccountState>();
    const totalDepositsBefore = new Map<string, BigNumber>();
    const markets = new Map<string, Contract>();
    const accountKey = (currency: string, maturity: string, user: string) =>
      `${currency}:${maturity}:${user.toLowerCase()}`;

    for (const input of data.residualTrees) {
      const ccy = toBytes32(input.currency);
      const cachedMarket = markets.get(input.currency);
      let market: Contract;
      if (cachedMarket) {
        market = cachedMarket;
      } else {
        market = await controller
          .getLendingMarket(ccy)
          .then((address: string) =>
            ethers.getContractAt('LendingMarket', address),
          );
        markets.set(input.currency, market);
        totalDepositsBefore.set(
          input.currency,
          await tokenVault.getTotalDepositAmount(ccy),
        );
      }

      expect(await market.paused()).to.equal(true);
      expect(
        await getTreeRoot(
          market.address,
          input.orderBookId,
          input.maturity,
          input.side,
        ),
      ).to.equal(input.expectedRoot);

      const oppositeBook =
        input.side === 'LEND'
          ? await market.getBorrowOrderBook(input.orderBookId, 0, 20)
          : await market.getLendOrderBook(input.orderBookId, 0, 20);
      treeContexts.push({
        input,
        ccy,
        market,
        pendingBefore: await controller.getPendingOrderAmount(
          ccy,
          input.maturity,
        ),
        oppositeBookBefore: serializeBook(oppositeBook),
      });

      for (const order of input.orders) {
        const storedOrder = await market.getOrder(
          input.orderBookId,
          order.orderId,
        );
        expect(storedOrder.maker).to.equal(order.maker);
        expect(storedOrder.amount).to.equal(order.amount);
        const key = accountKey(input.currency, input.maturity, order.maker);
        if (!accountStatesBefore.has(key)) {
          accountStatesBefore.set(
            key,
            await getAccountState(order.maker, ccy, input.maturity),
          );
        }
      }
    }

    const fill = data.incidentFillReversal;
    let fillTakerBefore: AccountState | undefined;
    let fillMakerBefore: AccountState | undefined;
    if (fill) {
      const ccy = toBytes32(fill.currency);
      fillTakerBefore = await getAccountState(fill.taker, ccy, fill.maturity);
      fillMakerBefore = await getAccountState(fill.maker, ccy, fill.maturity);
      expect(fillTakerBefore.deposit).to.equal(fill.expectedTakerDeposit);
      expect(fillTakerBefore.futureValue).to.equal(
        fill.expectedTakerFutureValue,
      );
      expect(fillMakerBefore.deposit).to.equal(fill.expectedMakerDeposit);
      expect(fillMakerBefore.futureValue).to.equal(
        fill.expectedMakerFutureValue,
      );
      expect(await tokenVault.paused()).to.equal(true);
    }

    for (const input of data.residualTrees) {
      const result = await hre.run('check-incident-residual-orders', {
        currency: input.currency,
        maturity: input.maturity,
        side: input.side,
      });
      expect(result.status).to.equal('NOT_RECOVERED');
    }

    const [nonOwner] = await ethers.getSigners();
    expect(ethers.utils.getAddress(await nonOwner.getAddress())).not.to.equal(
      ethers.utils.getAddress(await controller.owner()),
    );
    const firstTree = data.residualTrees[0];
    await expect(
      controller
        .connect(nonOwner)
        .recoverIncidentResidualOrders(
          toBytes32(firstTree.currency),
          firstTree.orderBookId,
          firstTree.maturity,
          sideValue(firstTree.side),
          firstTree.expectedRoot,
          firstTree.orders,
        ),
    ).to.be.revertedWith('Ownable: caller is not the owner');

    if (fill) {
      const result = await hre.run('check-incident-order-fill-reversal', {
        recoveryId: fill.recoveryId,
      });
      expect(result.status).to.equal('NOT_RECOVERED');
    }

    const executionStartBlock = await ethers.provider.getBlockNumber();
    const previousAutoUpdate = process.env.ENABLE_AUTO_UPDATE;
    const previousRecoveryAddress = process.env.INCIDENT_FILL_RECOVERY_ADDRESS;
    process.env.ENABLE_AUTO_UPDATE = 'true';
    if (fillRecovery) {
      process.env.INCIDENT_FILL_RECOVERY_ADDRESS = fillRecovery.address;
    }
    try {
      await hre.run('recover-incident-residual-orders');
    } finally {
      if (previousAutoUpdate === undefined) {
        delete process.env.ENABLE_AUTO_UPDATE;
      } else {
        process.env.ENABLE_AUTO_UPDATE = previousAutoUpdate;
      }
      if (previousRecoveryAddress === undefined) {
        delete process.env.INCIDENT_FILL_RECOVERY_ADDRESS;
      } else {
        process.env.INCIDENT_FILL_RECOVERY_ADDRESS = previousRecoveryAddress;
      }
    }
    const executionEndBlock = await ethers.provider.getBlockNumber();

    for (const context of treeContexts) {
      const { input, ccy, market } = context;
      expect(
        await getTreeRoot(
          market.address,
          input.orderBookId,
          input.maturity,
          input.side,
        ),
      ).to.equal(0);
      const recoveredBook =
        input.side === 'LEND'
          ? await market.getLendOrderBook(input.orderBookId, 0, 20)
          : await market.getBorrowOrderBook(input.orderBookId, 0, 20);
      expect(
        recoveredBook.unitPrices.every((value: BigNumber) => value.isZero()),
      ).to.equal(true);
      const oppositeBook =
        input.side === 'LEND'
          ? await market.getBorrowOrderBook(input.orderBookId, 0, 20)
          : await market.getLendOrderBook(input.orderBookId, 0, 20);
      expect(serializeBook(oppositeBook)).to.equal(context.oppositeBookBefore);
      expect(
        await controller.getPendingOrderAmount(ccy, input.maturity),
      ).to.equal(context.pendingBefore);
      expect(await market.paused()).to.equal(true);

      const recoveryEvents = await market.queryFilter(
        market.filters.IncidentResidualOrdersRecovered(
          input.orderBookId,
          sideValue(input.side),
          ccy,
        ),
        executionStartBlock + 1,
        executionEndBlock,
      );
      expect(recoveryEvents).to.have.length(1);
      expect(
        recoveryEvents[0].args?.orderIds.map((value: BigNumber) =>
          value.toString(),
        ),
      ).to.deep.equal(input.orders.map(({ orderId }) => orderId));

      for (const order of input.orders) {
        const storedOrder = await market.getOrder(
          input.orderBookId,
          order.orderId,
        );
        expect(storedOrder.maker).to.equal(ethers.constants.AddressZero);
        expect(storedOrder.amount).to.equal(0);
      }

      await expect(
        controller
          .connect(recoveryOwner)
          .recoverIncidentResidualOrders(
            ccy,
            input.orderBookId,
            input.maturity,
            sideValue(input.side),
            input.expectedRoot,
            input.orders,
          ),
      ).to.be.reverted;
    }

    for (const [currency, totalDepositBefore] of totalDepositsBefore) {
      expect(
        await tokenVault.getTotalDepositAmount(toBytes32(currency)),
      ).to.equal(totalDepositBefore);
    }

    for (const [key, before] of accountStatesBefore) {
      const [currency, maturity, user] = key.split(':');
      const after = await getAccountState(user, toBytes32(currency), maturity);
      const isFillMaker =
        fill &&
        currency === fill.currency &&
        maturity === fill.maturity &&
        user === fill.maker.toLowerCase();
      if (isFillMaker) {
        const amount = BigNumber.from(fill.amount);
        const amountInFV = BigNumber.from(fill.amountInFV);
        const depositDelta =
          fill.originalTakerSide === 'LEND' ? amount.mul(-1) : amount;
        const futureValueDelta =
          fill.originalTakerSide === 'LEND' ? amountInFV : amountInFV.mul(-1);
        expect(after.deposit).to.equal(before.deposit.add(depositDelta));
        expect(after.futureValue).to.equal(
          before.futureValue.add(futureValueDelta),
        );
      } else {
        expect(after.deposit).to.equal(before.deposit);
        expect(after.futureValue).to.equal(before.futureValue);
      }
    }

    if (fill && fillRecovery && fillTakerBefore && fillMakerBefore) {
      const ccy = toBytes32(fill.currency);
      const takerAfter = await getAccountState(fill.taker, ccy, fill.maturity);
      const makerAfter = await getAccountState(fill.maker, ccy, fill.maturity);
      const amount = BigNumber.from(fill.amount);
      const amountInFV = BigNumber.from(fill.amountInFV);
      const takerDepositDelta =
        fill.originalTakerSide === 'LEND' ? amount : amount.mul(-1);
      const takerFutureValueDelta =
        fill.originalTakerSide === 'LEND' ? amountInFV.mul(-1) : amountInFV;
      expect(takerAfter.deposit).to.equal(
        fillTakerBefore.deposit.add(takerDepositDelta),
      );
      expect(takerAfter.futureValue).to.equal(
        fillTakerBefore.futureValue.add(takerFutureValueDelta),
      );
      expect(makerAfter.deposit).to.equal(
        fillMakerBefore.deposit.sub(takerDepositDelta),
      );
      expect(makerAfter.futureValue).to.equal(
        fillMakerBefore.futureValue.sub(takerFutureValueDelta),
      );
      expect(await fillRecovery.executedRecoveries(fill.recoveryId)).to.equal(
        true,
      );
      expect(await tokenVault.paused()).to.equal(true);
      await expect(
        fillRecovery.connect(recoveryOwner).executeIncidentOrderFillReversal(
          fill.recoveryId,
          {
            ccy,
            maturity: fill.maturity,
            orderId: fill.orderId,
            taker: fill.taker,
            maker: fill.maker,
            originalTakerSide: sideValue(fill.originalTakerSide),
            amount: fill.amount,
            amountInFV: fill.amountInFV,
          },
          fill.expectedTakerDeposit,
          fill.expectedTakerFutureValue,
          fill.expectedMakerDeposit,
          fill.expectedMakerFutureValue,
        ),
      ).to.be.reverted;

      const recoveryEvents = await fillRecovery.queryFilter(
        fillRecovery.filters.IncidentOrderFillRecoveryExecuted(
          fill.recoveryId,
          fill.orderId,
          ccy,
        ),
        executionStartBlock + 1,
        executionEndBlock,
      );
      expect(recoveryEvents).to.have.length(1);
      const reversalEvents = await controller.queryFilter(
        controller.filters.IncidentOrderFillReversed(fill.orderId, ccy),
        executionStartBlock + 1,
        executionEndBlock,
      );
      expect(reversalEvents).to.have.length(1);
      expect(ethers.utils.getAddress(reversalEvents[0].args?.taker)).to.equal(
        ethers.utils.getAddress(fill.taker),
      );
      expect(ethers.utils.getAddress(reversalEvents[0].args?.maker)).to.equal(
        ethers.utils.getAddress(fill.maker),
      );
    }

    for (const input of data.residualTrees) {
      const result = await hre.run('check-incident-residual-orders', {
        currency: input.currency,
        maturity: input.maturity,
        side: input.side,
      });
      expect(result.status).to.equal('COMPLETED');
    }
    if (fill) {
      const result = await hre.run('check-incident-order-fill-reversal', {
        recoveryId: fill.recoveryId,
      });
      expect(result.status).to.equal('COMPLETED');
    }
  });
});
