import { expect } from 'chai';
import { BigNumber, Signer } from 'ethers';
import { readFileSync } from 'fs';
import hre, { deployments, ethers, network } from 'hardhat';
import { resolve } from 'path';

import simulateDeployment from '../../deploy/simulation';
import { NATIVE_CURRENCY_SYMBOL } from '../../utils/currencies';
import { toBytes32 } from '../../utils/strings';

type Side = 'LEND' | 'BORROW';

interface CorrectionInput {
  correctionId: string;
  maturity: string;
  correctionSide: Side;
  erroneousDroppedPV: string;
  expectedFV: string;
}

interface RetainedLendPositionInput {
  transactionHash: string;
  logIndex: string;
  maturity: string;
  amount: string;
  futureValue: string;
}

interface CorrectionBatchInput {
  batchId: string;
  user: string;
  fundingAmount: string;
  retainedLendPositions: RetainedLendPositionInput[];
  corrections: CorrectionInput[];
}

interface RecoveryData {
  version: 1;
  network: string;
  chainId: string;
  currency: string;
  batches: CorrectionBatchInput[];
}

const runForkTest = process.env.RUN_RECOVERY_FORK_TEST === 'true';
const describeFork = runForkTest ? describe : describe.skip;
const ZERO = BigNumber.from(0);

const addToMap = (
  map: Map<string, BigNumber>,
  key: string,
  amount: BigNumber,
) => map.set(key, (map.get(key) ?? ZERO).add(amount));

const positionKey = (user: string, maturity: string) =>
  `${user.toLowerCase()}:${maturity}`;

const getExecutionFundingAmount = (batch: CorrectionBatchInput) =>
  batch.retainedLendPositions.reduce(
    (total, position) => total.add(position.amount),
    BigNumber.from(batch.fundingAmount),
  );

describeFork('Fork Test: Order Book Incident Recovery', function () {
  const impersonatedAccounts = new Set<string>();

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

  const setBalance = async (account: string, amount: BigNumber) =>
    sendWithFallback(
      ['hardhat_setBalance', 'anvil_setBalance'],
      [account, ethers.utils.hexValue(amount)],
    );

  const impersonate = async (account: string): Promise<Signer> => {
    const normalized = ethers.utils.getAddress(account);
    await sendWithFallback(
      ['hardhat_impersonateAccount', 'anvil_impersonateAccount'],
      [normalized],
    );
    await setBalance(normalized, ethers.utils.parseEther('1000'));
    impersonatedAccounts.add(normalized);
    return ethers.provider.getSigner(normalized);
  };

  before(async function () {
    this.timeout(0);

    const currency = process.env.RECOVERY_TEST_CURRENCY?.toUpperCase();
    if (!currency) throw new Error('RECOVERY_TEST_CURRENCY is required');

    const [executor] = await ethers.getSigners();
    if (!executor) {
      throw new Error('The fork node must expose a local execution account');
    }
    const executorAddress = await executor.getAddress();
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));
    const [controllerAddress, tokenVaultAddress, beaconControllerAddress] =
      await Promise.all([
        proxyController.getAddress(toBytes32('LendingMarketController')),
        proxyController.getAddress(toBytes32('TokenVault')),
        proxyController.getAddress(toBytes32('BeaconProxyController')),
      ]);
    const lendingMarketController = await ethers.getContractAt(
      'LendingMarketController',
      controllerAddress,
    );
    const tokenVault = await ethers.getContractAt(
      'TokenVault',
      tokenVaultAddress,
    );
    const beaconController = await ethers.getContractAt(
      'BeaconProxyController',
      beaconControllerAddress,
    );
    const lendingMarket = await lendingMarketController
      .getLendingMarket(toBytes32(currency))
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
      MARKET_BASE_PERIOD: (
        await lendingMarketController.getMarketBasePeriod()
      ).toString(),
      MINIMUM_RELIABLE_AMOUNT: (
        await lendingMarket.minimumReliableAmountInBaseCurrency()
      ).toString(),
      RECOVERY_ENABLED: 'true',
      RECOVERY_OWNER_ADDRESS: executorAddress,
      SAFE_WALLET_ADDRESS: upgradeOwner,
    };
    const previousEnvironment = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(deploymentEnvironment)) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    try {
      await hre.run('deploy', {
        tags: 'FutureValueVault,LendingMarketController,LendingMarkets,OrderBookIncidentRecovery',
        noCompile: true,
        write: false,
      });
      await simulateDeployment(hre);
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    const recoveryAddress = (await deployments.get('OrderBookIncidentRecovery'))
      .address;
    const [controllerOwner, tokenVaultOwner] = await Promise.all([
      lendingMarketController.owner(),
      tokenVault.owner(),
    ]);
    const [controllerOwnerSigner, tokenVaultOwnerSigner] = await Promise.all([
      impersonate(controllerOwner),
      impersonate(tokenVaultOwner),
    ]);
    const [controllerAdminRole, tokenVaultAdminRole] = await Promise.all([
      lendingMarketController.DEFAULT_ADMIN_ROLE(),
      tokenVault.DEFAULT_ADMIN_ROLE(),
    ]);
    expect(
      await lendingMarketController.hasRole(
        controllerAdminRole,
        controllerOwner,
      ),
    ).to.equal(true);
    expect(
      await tokenVault.hasRole(tokenVaultAdminRole, tokenVaultOwner),
    ).to.equal(true);

    const [controllerOperatorRole, tokenVaultOperatorRole] = await Promise.all([
      lendingMarketController.OPERATOR_ROLE(),
      tokenVault.OPERATOR_ROLE(),
    ]);
    if (
      !(await lendingMarketController.hasRole(
        controllerOperatorRole,
        recoveryAddress,
      ))
    ) {
      await lendingMarketController
        .connect(controllerOwnerSigner)
        .addOperator(recoveryAddress)
        .then((tx) => tx.wait());
    }
    if (!(await tokenVault.hasRole(tokenVaultOperatorRole, recoveryAddress))) {
      await tokenVault
        .connect(tokenVaultOwnerSigner)
        .addOperator(recoveryAddress)
        .then((tx) => tx.wait());
    }

    const controllerDeployment = await deployments.get(
      'LendingMarketController',
    );
    const expectedControllerImplementation =
      controllerDeployment.implementation ?? controllerDeployment.address;
    const controllerProxy = await ethers.getContractAt(
      'UpgradeabilityProxy',
      controllerAddress,
    );
    expect(
      ethers.utils.getAddress(await controllerProxy.implementation()),
    ).to.equal(ethers.utils.getAddress(expectedControllerImplementation));

    const lendingMarketDeployment = await deployments.get('LendingMarket');
    const expectedLendingMarketImplementation =
      lendingMarketDeployment.implementation ?? lendingMarketDeployment.address;
    const lendingMarketBeacon = await beaconController
      .getBeaconProxyAddress(toBytes32('LendingMarket'))
      .then((address: string) =>
        ethers.getContractAt('UpgradeableBeacon', address),
      );
    expect(
      ethers.utils.getAddress(await lendingMarketBeacon.implementation()),
    ).to.equal(ethers.utils.getAddress(expectedLendingMarketImplementation));
  });

  after(async () => {
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
        // The disposable fork may already have been stopped after a failed test.
      }
    }
  });

  it('executes the reviewed recovery manifest and preserves protocol invariants', async function () {
    this.timeout(0);

    const currency = process.env.RECOVERY_TEST_CURRENCY?.toUpperCase();
    const recoveryReceiver = process.env.RECOVERY_TEST_RECEIVER_ADDRESS;

    if (!currency) throw new Error('RECOVERY_TEST_CURRENCY is required');

    const data = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'recovery-data',
          network.name,
          `${currency.toLowerCase()}.json`,
        ),
        'utf8',
      ),
    ) as RecoveryData;
    const chainId = (await ethers.provider.getNetwork()).chainId.toString();

    expect(data.version).to.equal(1);
    expect(data.network).to.equal(network.name);
    expect(data.chainId).to.equal(chainId);
    expect(data.currency).to.equal(currency);
    if (!recoveryReceiver) {
      throw new Error('RECOVERY_TEST_RECEIVER_ADDRESS is required');
    }

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      throw new Error('The fork node must expose a local execution account');
    }
    const executor = signers[0];
    const executorAddress = await executor.getAddress();
    const receiverAddress = ethers.utils.getAddress(recoveryReceiver);

    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));
    const [controllerAddress, tokenVaultAddress] = await Promise.all([
      proxyController.getAddress(toBytes32('LendingMarketController')),
      proxyController.getAddress(toBytes32('TokenVault')),
    ]);
    const lendingMarketController = await ethers.getContractAt(
      'LendingMarketController',
      controllerAddress,
    );
    const tokenVault = await ethers.getContractAt(
      'TokenVault',
      tokenVaultAddress,
    );
    const ccy = toBytes32(currency);
    const lendingMarketAddress = await lendingMarketController.getLendingMarket(
      ccy,
    );
    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      lendingMarketAddress,
    );
    const orderActionLogic = await ethers.getContractAt(
      'OrderActionLogic',
      lendingMarketAddress,
    );

    const nativeToken = await tokenVault.getTokenAddress(
      toBytes32(NATIVE_CURRENCY_SYMBOL),
    );
    const recovery = await deployments
      .get('OrderBookIncidentRecovery')
      .then(({ address }) =>
        ethers.getContractAt('OrderBookIncidentRecovery', address),
      );
    const operatorRole = await lendingMarketController.OPERATOR_ROLE();

    expect(ethers.utils.getAddress(await recovery.owner())).to.equal(
      ethers.utils.getAddress(executorAddress),
    );
    expect(
      ethers.utils.getAddress(await recovery.lendingMarketController()),
    ).to.equal(ethers.utils.getAddress(controllerAddress));
    expect(ethers.utils.getAddress(await recovery.tokenVault())).to.equal(
      ethers.utils.getAddress(tokenVaultAddress),
    );
    expect(ethers.utils.getAddress(await recovery.nativeToken())).to.equal(
      ethers.utils.getAddress(nativeToken),
    );
    expect(
      await lendingMarketController.hasRole(operatorRole, recovery.address),
    ).to.equal(true);
    if (data.batches.length > 0) {
      expect(await tokenVault.hasRole(operatorRole, recovery.address)).to.equal(
        true,
      );
    }
    expect(await tokenVault.paused()).to.equal(true);
    expect(await lendingMarket.paused()).to.equal(true);

    const tokenAddress = await tokenVault.getTokenAddress(ccy);
    const token = await ethers.getContractAt('IERC20', tokenAddress);
    const isNative =
      ethers.utils.getAddress(tokenAddress) ===
      ethers.utils.getAddress(nativeToken);
    const getTokenVaultAssetBalance = () => token.balanceOf(tokenVault.address);
    const getRecoveryAssetBalance = () =>
      isNative
        ? ethers.provider.getBalance(recovery.address)
        : token.balanceOf(recovery.address);
    const fundingTotal = data.batches.reduce(
      (total, batch) => total.add(getExecutionFundingAmount(batch)),
      ZERO,
    );

    const fundAccount = async (target: string, requiredAmount: BigNumber) => {
      const balance = await token.balanceOf(target);
      if (balance.gte(requiredAmount)) return;

      const holderAddress = process.env.RECOVERY_TEST_TOKEN_HOLDER_ADDRESS;
      if (!holderAddress) {
        throw new Error(
          `RECOVERY_TEST_TOKEN_HOLDER_ADDRESS is required to fund ${target}`,
        );
      }
      const holder = ethers.utils.getAddress(holderAddress);
      const holderSigner = await impersonate(holder);
      const shortfall = requiredAmount.sub(balance);
      expect((await token.balanceOf(holder)).gte(shortfall)).to.equal(true);
      await token
        .connect(holderSigner)
        .transfer(target, shortfall)
        .then((tx: any) => tx.wait());
    };

    if (isNative) {
      await setBalance(
        executorAddress,
        fundingTotal.add(ethers.utils.parseEther('1000')),
      );
    } else {
      await fundAccount(executorAddress, fundingTotal);
    }
    const depositDeltaByUser = new Map<string, BigNumber>();
    const correctionDeltaByPosition = new Map<string, BigNumber>();
    const pendingDeltaByMaturity = new Map<string, BigNumber>();
    const affectedUsers = new Set<string>();
    const recoveryUsers = new Set<string>();
    const targetMaturities = new Set<string>();
    affectedUsers.add(receiverAddress.toLowerCase());

    for (const batch of data.batches) {
      const user = ethers.utils.getAddress(batch.user);
      const userKey = user.toLowerCase();
      affectedUsers.add(userKey);
      recoveryUsers.add(userKey);
      addToMap(depositDeltaByUser, userKey, getExecutionFundingAmount(batch));
      for (const correction of batch.corrections) {
        targetMaturities.add(correction.maturity);
        const pv = BigNumber.from(correction.erroneousDroppedPV);
        const fv = BigNumber.from(correction.expectedFV);
        addToMap(pendingDeltaByMaturity, correction.maturity, pv);
        if (correction.correctionSide === 'BORROW') {
          addToMap(depositDeltaByUser, userKey, pv);
          addToMap(
            correctionDeltaByPosition,
            positionKey(user, correction.maturity),
            fv.mul(-1),
          );
        } else {
          addToMap(depositDeltaByUser, userKey, pv.mul(-1));
          addToMap(
            correctionDeltaByPosition,
            positionKey(user, correction.maturity),
            fv,
          );
        }
      }
    }

    for (const user of recoveryUsers) {
      const maturities = await lendingMarketController.getUsedMaturities(
        ccy,
        user,
      );
      for (const maturity of maturities) {
        targetMaturities.add(maturity.toString());
      }
    }

    const depositsBefore = new Map<string, BigNumber>();
    for (const user of affectedUsers) {
      depositsBefore.set(
        user.toLowerCase(),
        await tokenVault.getDepositAmount(user, ccy),
      );
    }
    const positionsBefore = new Map<string, BigNumber>();
    for (const user of affectedUsers) {
      for (const maturity of targetMaturities) {
        const { futureValue } = await lendingMarketController.getPosition(
          ccy,
          maturity,
          user,
        );
        positionsBefore.set(positionKey(user, maturity), futureValue);
      }
    }
    const pendingBefore = new Map<string, BigNumber>();
    for (const maturity of targetMaturities) {
      pendingBefore.set(
        maturity,
        await lendingMarketController.getPendingOrderAmount(ccy, maturity),
      );
    }

    const totalDepositBefore = await tokenVault.getTotalDepositAmount(ccy);
    const tokenVaultBalanceBefore = await getTokenVaultAssetBalance();
    const recoveryAssetBalanceBefore = await getRecoveryAssetBalance();
    const orderBookIdsBefore = await lendingMarketController.getOrderBookIds(
      ccy,
    );
    const maturitiesBefore = await lendingMarketController.getMaturities(ccy);
    const genesisValueVault = await proxyController
      .getAddress(toBytes32('GenesisValueVault'))
      .then((address: string) =>
        ethers.getContractAt('GenesisValueVault', address),
      );
    for (const maturity of targetMaturities) {
      expect(await genesisValueVault.isAutoRolled(ccy, maturity)).to.equal(
        false,
      );
    }

    const executionStartBlock = await ethers.provider.getBlockNumber();
    const previousReceiver = process.env.RECOVERY_RECEIVER_ADDRESS;
    process.env.RECOVERY_RECEIVER_ADDRESS = receiverAddress;
    try {
      await hre.run('recover-user-funds', { currency });
    } finally {
      if (previousReceiver === undefined) {
        delete process.env.RECOVERY_RECEIVER_ADDRESS;
      } else {
        process.env.RECOVERY_RECEIVER_ADDRESS = previousReceiver;
      }
    }
    const executionEndBlock = await ethers.provider.getBlockNumber();
    const cleanedAmountByMaturity = new Map<string, BigNumber>();
    const canceledLendAmountByUser = new Map<string, BigNumber>();
    const ordersCleanedEvents = await orderActionLogic.queryFilter(
      orderActionLogic.filters.OrdersCleaned(),
      executionStartBlock + 1,
      executionEndBlock,
    );
    const orderCanceledEvents = await orderActionLogic.queryFilter(
      orderActionLogic.filters.OrderCanceled(),
      executionStartBlock + 1,
      executionEndBlock,
    );
    const correctionBatchEvents = await recovery.queryFilter(
      recovery.filters.CorrectionBatchExecuted(),
      executionStartBlock + 1,
      executionEndBlock,
    );
    const lastCorrectionBlockByUser = new Map<string, number>();
    for (const event of ordersCleanedEvents) {
      if (
        event.args &&
        affectedUsers.has(event.args.maker.toLowerCase()) &&
        event.args.ccy === ccy
      ) {
        addToMap(
          cleanedAmountByMaturity,
          event.args.maturity.toString(),
          event.args.amount,
        );
      }
    }
    for (const event of orderCanceledEvents) {
      if (
        event.args &&
        recoveryUsers.has(event.args.maker.toLowerCase()) &&
        event.args.ccy === ccy &&
        BigNumber.from(event.args.side).eq(0)
      ) {
        addToMap(
          canceledLendAmountByUser,
          event.args.maker.toLowerCase(),
          event.args.amount,
        );
      }
    }
    for (const event of correctionBatchEvents) {
      if (event.args) {
        lastCorrectionBlockByUser.set(
          event.args.user.toLowerCase(),
          event.blockNumber,
        );
      }
    }

    for (const [user, delta] of depositDeltaByUser) {
      // Canceling an active LEND order releases its working amount in the
      // derived Deposit balance, although it does not change the raw Deposit.
      const blockTag = lastCorrectionBlockByUser.get(user);
      if (blockTag === undefined) {
        throw new Error(`Missing correction batch event for ${user}`);
      }
      expect(
        await tokenVault.getDepositAmount(user, ccy, { blockTag }),
      ).to.equal(
        depositsBefore
          .get(user)!
          .add(delta)
          .add(canceledLendAmountByUser.get(user) ?? ZERO),
      );
      // The final asset-transfer call moves the remaining Deposit after moving
      // every FV and GV position to the Receiver.
      expect(await tokenVault.getDepositAmount(user, ccy)).to.equal(0);
    }
    for (const user of recoveryUsers) {
      const transferId = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['bytes32', 'address'],
          [ccy, user],
        ),
      );
      expect(await recovery.executedAssetTransfers(transferId)).to.equal(true);
    }
    for (const user of recoveryUsers) {
      expect(await genesisValueVault.getBalance(ccy, user, 0)).to.equal(0);
    }
    for (const maturity of targetMaturities) {
      let expectedReceiverFV = positionsBefore.get(
        positionKey(receiverAddress, maturity),
      )!;
      for (const user of recoveryUsers) {
        const key = positionKey(user, maturity);
        expectedReceiverFV = expectedReceiverFV
          .add(positionsBefore.get(key)!)
          .add(correctionDeltaByPosition.get(key) ?? ZERO);
        const { futureValue } = await lendingMarketController.getPosition(
          ccy,
          maturity,
          user,
        );
        expect(futureValue).to.equal(0);
      }
      const { futureValue: receiverFV } =
        await lendingMarketController.getPosition(
          ccy,
          maturity,
          receiverAddress,
        );
      expect(receiverFV).to.equal(expectedReceiverFV);
    }
    for (const [maturity, delta] of pendingDeltaByMaturity) {
      expect(
        await lendingMarketController.getPendingOrderAmount(ccy, maturity),
      ).to.equal(
        pendingBefore
          .get(maturity)!
          .add(delta)
          .sub(cleanedAmountByMaturity.get(maturity) ?? ZERO),
      );
    }

    expect(await tokenVault.getTotalDepositAmount(ccy)).to.equal(
      totalDepositBefore.add(fundingTotal),
    );
    expect(await getTokenVaultAssetBalance()).to.equal(
      tokenVaultBalanceBefore.add(fundingTotal),
    );
    expect(await getRecoveryAssetBalance()).to.equal(
      recoveryAssetBalanceBefore,
    );
    if (!isNative) {
      expect(
        await token.allowance(recovery.address, tokenVault.address),
      ).to.equal(0);
    }
    expect(await tokenVault.paused()).to.equal(true);
    expect(await lendingMarket.paused()).to.equal(true);
    expect(
      (await lendingMarketController.getOrderBookIds(ccy)).map((value) =>
        value.toString(),
      ),
    ).to.deep.equal(orderBookIdsBefore.map((value) => value.toString()));
    expect(
      (await lendingMarketController.getMaturities(ccy)).map((value) =>
        value.toString(),
      ),
    ).to.deep.equal(maturitiesBefore.map((value) => value.toString()));
    for (const maturity of targetMaturities) {
      expect(await genesisValueVault.isAutoRolled(ccy, maturity)).to.equal(
        false,
      );
    }

    const correctionEvents = await recovery.queryFilter(
      recovery.filters.CorrectionExecuted(),
      executionStartBlock + 1,
      executionEndBlock,
    );
    const correctionCount = data.batches.reduce(
      (count, batch) => count + batch.corrections.length,
      0,
    );
    expect(correctionEvents).to.have.length(correctionCount);
    for (const batch of data.batches) {
      expect(await recovery.executedBatches(batch.batchId)).to.equal(true);
      for (const correction of batch.corrections) {
        expect(
          await recovery.executedCorrections(correction.correctionId),
        ).to.equal(true);
      }
    }

    const depositRows: Record<string, string>[] = [];
    const coverageRows: Record<string, string | boolean>[] = [];
    const positionRows: Record<string, string>[] = [];
    const orderRows: Record<string, string>[] = [];

    for (const userKey of [...affectedUsers].sort()) {
      const user = ethers.utils.getAddress(userKey);
      const deposit = await tokenVault.getDepositAmount(user, ccy);
      depositRows.push({
        user,
        currency,
        deposit: deposit.toString(),
      });

      const [[isEnoughCollateral], coverage] = await Promise.all([
        tokenVault.isCovered(user, ethers.constants.HashZero),
        tokenVault.getCoverage(user),
      ]);
      coverageRows.push({
        user,
        isEnoughCollateral,
        coverage: coverage.toString(),
      });

      const maturities: Set<string> = new Set(
        (await lendingMarketController.getUsedMaturities(ccy, user)).map(
          (value: BigNumber) => value.toString(),
        ),
      );
      for (const batch of data.batches) {
        if (batch.user.toLowerCase() === userKey) {
          for (const correction of batch.corrections) {
            maturities.add(correction.maturity);
          }
        }
      }
      for (const maturity of targetMaturities) maturities.add(maturity);

      for (const maturity of [...maturities].sort(
        (a, b) => Number(a) - Number(b),
      )) {
        const { presentValue, futureValue } =
          await lendingMarketController.getPosition(ccy, maturity, user);
        const positionSign = presentValue.isZero() ? futureValue : presentValue;
        positionRows.push({
          user,
          currency,
          maturity,
          side: positionSign.gt(0)
            ? 'LEND'
            : positionSign.lt(0)
            ? 'BORROW'
            : 'NONE',
          presentValue: presentValue.toString(),
          futureValue: futureValue.toString(),
        });

        const orderBookId = await lendingMarketController.getOrderBookId(
          ccy,
          maturity,
        );
        const [lendOrderIds, borrowOrderIds] = await Promise.all([
          lendingMarket.getLendOrderIds(orderBookId, user),
          lendingMarket.getBorrowOrderIds(orderBookId, user),
        ]);
        if (recoveryUsers.has(userKey)) {
          expect(lendOrderIds.activeOrderIds).to.have.length(0);
          expect(borrowOrderIds.activeOrderIds).to.have.length(0);
        }
        const orders = [
          ...lendOrderIds.activeOrderIds.map((orderId: BigNumber) => ({
            orderId,
            side: 'LEND',
            status: 'ACTIVE',
          })),
          ...lendOrderIds.inActiveOrderIds.map((orderId: BigNumber) => ({
            orderId,
            side: 'LEND',
            status: 'INACTIVE',
          })),
          ...borrowOrderIds.activeOrderIds.map((orderId: BigNumber) => ({
            orderId,
            side: 'BORROW',
            status: 'ACTIVE',
          })),
          ...borrowOrderIds.inActiveOrderIds.map((orderId: BigNumber) => ({
            orderId,
            side: 'BORROW',
            status: 'INACTIVE',
          })),
        ];

        if (orders.length === 0) {
          orderRows.push({
            user,
            currency,
            maturity,
            side: 'NONE',
            status: 'NONE',
            orderId: '-',
            amount: '0',
            unitPrice: '-',
          });
        } else {
          for (const { orderId, side, status } of orders) {
            const order = await lendingMarket.getOrder(orderBookId, orderId);
            orderRows.push({
              user,
              currency,
              maturity,
              side,
              status,
              orderId: orderId.toString(),
              amount: order.amount.toString(),
              unitPrice: order.unitPrice.toString(),
            });
          }
        }
      }
    }

    console.log('\nRecovery result: deposits');
    console.table(depositRows);
    console.log('Recovery result: collateral coverage');
    console.table(coverageRows);
    console.log('Recovery result: positions');
    console.table(positionRows);
    console.log('Recovery result: orders');
    console.table(orderRows);
  });
});
