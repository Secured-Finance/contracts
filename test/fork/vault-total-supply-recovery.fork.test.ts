import { expect } from 'chai';
import { BigNumber, Contract, Signer } from 'ethers';
import { readFileSync } from 'fs';
import hre, { deployments, ethers, network } from 'hardhat';
import { resolve } from 'path';

import simulateDeployment from '../../deploy/simulation';
import { toBytes32 } from '../../utils/strings';

interface TotalSupplyCorrectionInput {
  maturity: string;
  correctionAmount: string;
  expectedLendingSupply: string;
  expectedBorrowingSupply: string;
}

interface RecoveryData {
  version: 2;
  network: string;
  chainId: string;
  currency: string;
  corrections: TotalSupplyCorrectionInput[];
}

interface SupplySnapshot {
  maturity: BigNumber;
  correctionAmount: BigNumber;
  lendingSupply: BigNumber;
  borrowingSupply: BigNumber;
}

const runForkTest =
  process.env.RUN_VAULT_TOTAL_SUPPLY_RECOVERY_FORK_TEST === 'true';
const describeFork = runForkTest ? describe : describe.skip;

describeFork('Fork Test: Vault Total Supply Recovery', function () {
  const impersonatedAccounts = new Set<string>();
  let snapshotId: string;

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

  const impersonate = async (account: string): Promise<Signer> => {
    const normalized = ethers.utils.getAddress(account);
    await sendWithFallback(
      ['hardhat_impersonateAccount', 'anvil_impersonateAccount'],
      [normalized],
    );
    await sendWithFallback(
      ['hardhat_setBalance', 'anvil_setBalance'],
      [normalized, ethers.utils.hexValue(ethers.utils.parseEther('1000'))],
    );
    impersonatedAccounts.add(normalized);
    return ethers.provider.getSigner(normalized);
  };

  const readSupply = async (
    correction: TotalSupplyCorrectionInput,
    ccy: string,
    genesisValueVault: Contract,
    futureValueVault: Contract,
  ): Promise<SupplySnapshot> => {
    const maturity = BigNumber.from(correction.maturity);
    const correctionAmount = BigNumber.from(correction.correctionAmount);
    const [lendingSupply, borrowingSupply] = maturity.isZero()
      ? await Promise.all([
          genesisValueVault.getTotalLendingSupply(ccy),
          genesisValueVault.getTotalBorrowingSupply(ccy),
        ])
      : await Promise.all([
          futureValueVault.getTotalLendingSupply(maturity),
          futureValueVault.getTotalBorrowingSupply(maturity),
        ]);

    return {
      maturity,
      correctionAmount,
      lendingSupply,
      borrowingSupply,
    };
  };

  before(async function () {
    this.timeout(0);
    snapshotId = await network.provider.send('evm_snapshot');
  });

  after(async () => {
    if (snapshotId) await network.provider.send('evm_revert', [snapshotId]);

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
        // The fork may clear impersonation state when the snapshot is reverted.
      }
    }
  });

  it('upgrades the protocol and applies every reviewed correction atomically', async function () {
    this.timeout(0);

    const currency = process.env.RECOVERY_TEST_CURRENCY?.toUpperCase();
    if (!currency) throw new Error('RECOVERY_TEST_CURRENCY is required');

    const data = JSON.parse(
      readFileSync(
        resolve(
          hre.config.paths.root,
          'recovery-data',
          network.name,
          `${currency.toLowerCase()}.json`,
        ),
        'utf8',
      ),
    ) as RecoveryData;
    expect(await hre.getChainId()).to.equal(data.chainId);
    expect(data.currency).to.equal(currency);

    const [localExecutor] = await ethers.getSigners();
    if (!localExecutor) {
      throw new Error('The fork node must expose a local execution account');
    }

    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));
    const [controllerAddress, beaconControllerAddress] = await Promise.all([
      proxyController.getAddress(toBytes32('LendingMarketController')),
      proxyController.getAddress(toBytes32('BeaconProxyController')),
    ]);
    const controllerBeforeUpgrade = await ethers.getContractAt(
      'LendingMarketController',
      controllerAddress,
    );
    const beaconController = await ethers.getContractAt(
      'BeaconProxyController',
      beaconControllerAddress,
    );
    const lendingMarketAddress = await controllerBeforeUpgrade.getLendingMarket(
      toBytes32(currency),
    );
    const lendingMarketBeforeUpgrade = await ethers.getContractAt(
      'LendingMarket',
      lendingMarketAddress,
    );
    const [upgradeOwner, beaconUpgradeOwner] = await Promise.all([
      proxyController.owner(),
      beaconController.owner(),
    ]);
    expect(ethers.utils.getAddress(beaconUpgradeOwner)).to.equal(
      ethers.utils.getAddress(upgradeOwner),
    );
    const ownerSigner = await impersonate(upgradeOwner);

    const environment: Record<string, string> = {
      ENABLE_AUTO_UPDATE: 'true',
      MARKET_BASE_PERIOD: (
        await controllerBeforeUpgrade.getMarketBasePeriod()
      ).toString(),
      MINIMUM_RELIABLE_AMOUNT: (
        await lendingMarketBeforeUpgrade.minimumReliableAmountInBaseCurrency()
      ).toString(),
      SAFE_WALLET_ADDRESS: upgradeOwner,
    };
    const previousEnvironment = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(environment)) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }

    try {
      await hre.run('deploy', {
        tags: 'GenesisValueVault,FutureValueVault,LendingMarketController,LendingMarkets',
        noCompile: true,
        write: false,
      });
      await simulateDeployment(hre);

      const controller = await ethers.getContractAt(
        'LendingMarketController',
        controllerAddress,
      );
      const ccy = toBytes32(currency);
      const [genesisValueVaultAddress, futureValueVaultAddress] =
        await Promise.all([
          proxyController.getAddress(toBytes32('GenesisValueVault')),
          controller.getFutureValueVault(ccy),
        ]);
      const [genesisValueVault, futureValueVault, lendingMarket] =
        await Promise.all([
          ethers.getContractAt('GenesisValueVault', genesisValueVaultAddress),
          ethers.getContractAt('FutureValueVault', futureValueVaultAddress),
          ethers.getContractAt('LendingMarket', lendingMarketAddress),
        ]);

      if (!(await lendingMarket.paused())) {
        await controller
          .connect(ownerSigner)
          .pauseLendingMarket(ccy)
          .then((transactionResponse: any) => transactionResponse.wait());
      }
      expect(await lendingMarket.paused()).to.equal(true);

      const suppliesBefore = await Promise.all(
        data.corrections.map((correction) =>
          readSupply(correction, ccy, genesisValueVault, futureValueVault),
        ),
      );
      for (const [index, before] of suppliesBefore.entries()) {
        expect(before.lendingSupply).to.equal(
          data.corrections[index].expectedLendingSupply,
        );
        expect(before.borrowingSupply).to.equal(
          data.corrections[index].expectedBorrowingSupply,
        );
      }
      const executionStartBlock = await ethers.provider.getBlockNumber();

      await hre.run('recover-vault-total-supplies', { currency });

      expect(await ethers.provider.getBlockNumber()).to.equal(
        executionStartBlock + 1,
      );
      for (const before of suppliesBefore) {
        const vault = before.maturity.isZero()
          ? genesisValueVault
          : futureValueVault;
        const [lendingSupplyAfter, borrowingSupplyAfter] =
          before.maturity.isZero()
            ? await Promise.all([
                vault.getTotalLendingSupply(ccy),
                vault.getTotalBorrowingSupply(ccy),
              ])
            : await Promise.all([
                vault.getTotalLendingSupply(before.maturity),
                vault.getTotalBorrowingSupply(before.maturity),
              ]);

        expect(lendingSupplyAfter).to.equal(
          before.lendingSupply.sub(before.correctionAmount),
        );
        expect(borrowingSupplyAfter).to.equal(
          before.borrowingSupply.sub(before.correctionAmount),
        );
      }
      expect(await lendingMarket.paused()).to.equal(true);

      const blockAfterExecution = await ethers.provider.getBlockNumber();
      let repeatedExecutionError: unknown;
      try {
        await hre.run('recover-vault-total-supplies', { currency });
      } catch (error) {
        repeatedExecutionError = error;
      }
      expect(repeatedExecutionError).to.be.instanceOf(Error);
      expect((repeatedExecutionError as Error).message).to.contain(
        'Stored total supply mismatch',
      );
      expect(await ethers.provider.getBlockNumber()).to.equal(
        blockAfterExecution,
      );
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
