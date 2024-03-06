import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { SECONDS_IN_YEAR } from '../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ReserveFund = artifacts.require('ReserveFund');
const ProxyController = artifacts.require('ProxyController');
const GenesisValueVaultCaller = artifacts.require('GenesisValueVaultCaller');

const { deployContract, deployMockContract } = waffle;

describe('GenesisValueVault', () => {
  let mockReserveFund: MockContract;

  let genesisValueVaultProxy: Contract;
  ReserveFund;
  let genesisValueVaultCaller: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let targetCurrency: string;
  let currencyIdx = 0;

  const initialCompoundFactor = BigNumber.from(1000000);
  const maturity = 1;
  const nextMaturity = 86401;
  const decimals = 4;
  const fvAmount = BigNumber.from(2000000);
  const unitPrice = 8000;

  before(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Set up for the mocks
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const genesisValueVault = await ethers
      .getContractFactory('GenesisValueVault')
      .then((factory) => factory.deploy());

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const genesisValueAddress = await proxyController
      .setGenesisValueVaultImpl(genesisValueVault.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    genesisValueVaultProxy = await ethers.getContractAt(
      'GenesisValueVault',
      genesisValueAddress,
    );

    // Deploy GenesisValueVaultCaller
    genesisValueVaultCaller = await deployContract(
      owner,
      GenesisValueVaultCaller,
      [genesisValueVaultProxy.address],
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['GenesisValueVault', genesisValueVaultProxy],
      ['ReserveFund', mockReserveFund],
      ['LendingMarketController', genesisValueVaultCaller],
    ];

    const importAddressesArgs = {
      names: migrationTargets.map(([name]) =>
        ethers.utils.formatBytes32String(name),
      ),
      addresses: migrationTargets.map(([, contract]) => contract.address),
    };

    await addressResolverProxy.importAddresses(
      importAddressesArgs.names,
      importAddressesArgs.addresses,
    );
    await migrationAddressResolver.buildCaches([
      genesisValueVaultProxy.address,
    ]);
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;
  });

  describe('Initialize', async () => {
    it('Initialize contract settings', async () => {
      // const unitPrice = 5000;

      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );

      await genesisValueVaultCaller.updateInitialCompoundFactor(
        targetCurrency,
        unitPrice,
      );

      expect(await genesisValueVaultProxy.isInitialized(targetCurrency)).to
        .true;
      expect(
        await genesisValueVaultProxy.getCurrentMaturity(targetCurrency),
      ).to.equals(maturity);
      expect(await genesisValueVaultProxy.decimals(targetCurrency)).to.equals(
        decimals,
      );

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturity,
      );

      expect(autoRollLog.unitPrice).to.equals(unitPrice);
      expect(autoRollLog.lendingCompoundFactor).to.equals(
        initialCompoundFactor.mul(10000).div(unitPrice),
      );
      expect(autoRollLog.borrowingCompoundFactor).to.equals(
        initialCompoundFactor.mul(10000).div(unitPrice),
      );
      expect(autoRollLog.next).to.equals(0);
      expect(autoRollLog.prev).to.equals(0);
    });

    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        genesisValueVaultProxy.initialize(ethers.constants.AddressZero),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const genesisValueVault = await ethers
        .getContractFactory('GenesisValueVault')
        .then((factory) => factory.deploy());

      await expect(
        genesisValueVault.initialize(ethers.constants.AddressZero),
      ).revertedWith('Must be called from proxy contract');
    });

    it('Fail to initialize the currency setting due to execution by non-accepted contract', async () => {
      await expect(
        genesisValueVaultProxy.initializeCurrencySetting(
          targetCurrency,
          decimals,
          initialCompoundFactor,
          maturity,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to update the initial compound factor due to execution by non-accepted contract', async () => {
      await expect(
        genesisValueVaultProxy.updateInitialCompoundFactor(
          targetCurrency,
          unitPrice,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to initialize the currency setting due to zero compound factor', async () => {
      await expect(
        genesisValueVaultCaller.initializeCurrencySetting(
          targetCurrency,
          decimals,
          0,
          maturity,
        ),
      ).revertedWith('CompoundFactorIsZero');
    });

    it('Fail to initialize the currency setting due to the initialized', async () => {
      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );

      await expect(
        genesisValueVaultCaller.initializeCurrencySetting(
          targetCurrency,
          decimals,
          initialCompoundFactor,
          maturity,
        ),
      ).revertedWith('CurrencyAlreadyInitialized');
    });

    it('Fail to update the initial compound factor due to the finalized', async () => {
      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );

      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        nextMaturity,
        8000,
        0,
      );

      await expect(
        genesisValueVaultCaller.updateInitialCompoundFactor(
          targetCurrency,
          unitPrice,
        ),
      ).revertedWith('InitialCompoundFactorAlreadyFinalized');
    });
  });

  describe('Balance', async () => {
    beforeEach(async () => {
      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );
    });

    describe('Calculate balance', async () => {
      const orderFeeRate = 1000;

      beforeEach(async () => {
        await genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          8000,
          orderFeeRate,
        );
      });

      it('Convert balance to selected maturity from another maturity', async () => {
        const amount = await genesisValueVaultProxy.calculateFVFromFV(
          targetCurrency,
          maturity,
          nextMaturity,
          fvAmount,
        );

        const fee = fvAmount
          .mul(nextMaturity - maturity)
          .mul(orderFeeRate)
          .div(SECONDS_IN_YEAR)
          .div(10000);

        const estimatedFVAmount = fvAmount.mul(10000).div(8000).sub(fee);

        expect(amount.sub(estimatedFVAmount).abs()).lte(1);
      });

      it('Convert 0 to selected maturity from another maturity', async () => {
        const amount = await genesisValueVaultProxy.calculateFVFromFV(
          targetCurrency,
          maturity,
          nextMaturity,
          0,
        );

        expect(amount).to.equals(0);
      });

      it('Convert balance to selected maturity from same maturity', async () => {
        const amount = await genesisValueVaultProxy.calculateFVFromFV(
          targetCurrency,
          maturity,
          maturity,

          fvAmount,
        );

        expect(amount).to.equals(fvAmount);
      });

      it('Calculate amount in FV from positive amount in GV', async () => {
        const gvAmount = BigNumber.from(3000000000000);

        const amount = await genesisValueVaultProxy.calculateFVFromGV(
          targetCurrency,
          nextMaturity,
          gvAmount,
        );

        const compoundFactor =
          await genesisValueVaultProxy.getLendingCompoundFactor(targetCurrency);

        expect(amount).to.equals(
          gvAmount.mul(compoundFactor).div(BigNumber.from(10).pow(decimals)),
        );
      });

      it('Calculate amount in FV from negative amount in GV', async () => {
        const gvAmount = BigNumber.from(-3000000000000);

        const amount = await genesisValueVaultProxy.calculateFVFromGV(
          targetCurrency,
          nextMaturity,
          gvAmount,
        );

        const compoundFactor =
          await genesisValueVaultProxy.getLendingCompoundFactor(targetCurrency);

        expect(amount).to.equals(
          gvAmount.mul(compoundFactor).div(BigNumber.from(10).pow(decimals)),
        );
      });

      it('Fail to calculate amount in FV from amount in GV due to no compound factor', async () => {
        const gvAmount = BigNumber.from(-3000000000000);

        await expect(
          genesisValueVaultProxy.calculateFVFromGV(
            targetCurrency,
            1234567890,
            gvAmount,
          ),
        ).revertedWith('NoCompoundFactorExists');
      });

      it('Fail to calculate amount in GV from amount in FV due to no compound factor', async () => {
        await expect(
          genesisValueVaultProxy.calculateGVFromFV(
            targetCurrency,
            1234567890,
            fvAmount,
          ),
        ).revertedWith('NoCompoundFactorExists');
      });
    });

    describe('Update balance', async () => {
      it('Update the genesis value', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const totalLendingSupply =
          await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
        const totalBorrowingSupply =
          await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);
        const aliceBalanceInFV =
          await genesisValueVaultProxy.getBalanceInFutureValue(
            targetCurrency,
            alice.address,
          );
        const maturityBalance =
          await genesisValueVaultProxy.getMaturityGenesisValue(
            targetCurrency,
            maturity,
          );

        expect(totalLendingSupply).to.equals(
          fvAmount
            .mul(BigNumber.from(10).pow(decimals))
            .div(initialCompoundFactor),
        );
        expect(totalBorrowingSupply).to.equals(0);
        expect(aliceBalanceInFV).to.equals(fvAmount);
        expect(maturityBalance).to.equals(totalLendingSupply);
      });

      it('Update the genesis value after auto-rolls', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount.mul(100),
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          mockReserveFund.address,
          maturity,
          -fvAmount,
        );

        await genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          8000,
          1000,
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          nextMaturity,
          fvAmount.mul(100),
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          mockReserveFund.address,
          nextMaturity,
          1,
        );

        const totalLendingSupply =
          await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
        const totalBorrowingSupply =
          await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );
        const rfBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          mockReserveFund.address,
        );

        expect(totalBorrowingSupply).to.equals(
          aliceBalance.add(rfBalance).abs(),
        );
        expect(totalLendingSupply).to.equals(0);
      });

      it('Update the genesis value with residual amount', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        await genesisValueVaultCaller.updateGenesisValueWithResidualAmount(
          targetCurrency,
          bob.address,
          maturity,
        );

        const totalLendingSupply =
          await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
        const totalBorrowingSupply =
          await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

        expect(totalLendingSupply).to.equals(
          fvAmount
            .mul(BigNumber.from(10).pow(decimals))
            .div(initialCompoundFactor),
        );
        expect(totalBorrowingSupply).to.equals(totalLendingSupply);
      });

      it('Update the genesis value from a positive amount to a negative amount', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount.div(2),
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount.mul(2),
        );

        const totalLendingSupply =
          await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
        const totalBorrowingSupply =
          await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

        expect(totalBorrowingSupply).to.equals(
          fvAmount
            .mul(3)
            .div(2)
            .mul(BigNumber.from(10).pow(decimals))
            .div(initialCompoundFactor),
        );
        expect(totalLendingSupply).to.equals(0);
      });

      it('Update the genesis value from a negative amount to a positive amount', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount,
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount.div(2),
        );

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount.mul(2),
        );

        const totalLendingSupply =
          await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
        const totalBorrowingSupply =
          await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

        expect(totalLendingSupply).to.equals(
          fvAmount
            .mul(3)
            .div(2)
            .mul(BigNumber.from(10).pow(decimals))
            .div(initialCompoundFactor),
        );
        expect(totalBorrowingSupply).to.equals(0);
      });

      it('Fail to update the genesis value due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.updateGenesisValueWithFutureValue(
            targetCurrency,
            alice.address,
            maturity,
            fvAmount,
          ),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });

      it('Fail to update the genesis value with residual amount due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.updateGenesisValueWithResidualAmount(
            targetCurrency,
            alice.address,
            maturity,
          ),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });
    });

    describe('Lock and unlock balance', async () => {
      it('Lock user balance', async () => {
        const lockedBalanceBefore =
          await genesisValueVaultProxy.getTotalLockedBalance(targetCurrency);

        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await expect(
          genesisValueVaultCaller.lock(
            targetCurrency,
            alice.address,
            aliceBalance,
          ),
        )
          .emit(genesisValueVaultProxy, 'BalanceLocked')
          .withArgs(targetCurrency, alice.address, aliceBalance);

        const lockedBalanceAfter =
          await genesisValueVaultProxy.getTotalLockedBalance(targetCurrency);

        expect(lockedBalanceAfter.sub(lockedBalanceBefore)).to.equals(
          aliceBalance,
        );
      });

      it('Unlock user balance', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await genesisValueVaultCaller.lock(
          targetCurrency,
          alice.address,
          aliceBalance,
        );

        const lockedBalanceBefore =
          await genesisValueVaultProxy.getTotalLockedBalance(targetCurrency);

        await expect(
          genesisValueVaultCaller.unlock(
            targetCurrency,
            alice.address,
            aliceBalance,
          ),
        )
          .emit(genesisValueVaultProxy, 'BalanceUnlocked')
          .withArgs(targetCurrency, alice.address, aliceBalance);

        const lockedBalanceAfter =
          await genesisValueVaultProxy.getTotalLockedBalance(targetCurrency);

        expect(lockedBalanceBefore.sub(lockedBalanceAfter)).to.equals(
          aliceBalance,
        );
      });

      it('Fail to lock user balance if balance is minus', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount,
        );

        await expect(
          genesisValueVaultCaller.lock(targetCurrency, alice.address, 100),
        ).revertedWith('InsufficientBalance');
      });

      it('Fail to lock user balance if balance is 0', async () => {
        await expect(
          genesisValueVaultCaller.lock(targetCurrency, alice.address, 100),
        ).revertedWith('InsufficientBalance');
      });

      it('Fail to unlock user balance if if total unlock balance is insufficient', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await genesisValueVaultCaller.lock(
          targetCurrency,
          alice.address,
          aliceBalance,
        );

        await expect(
          genesisValueVaultCaller.unlock(
            targetCurrency,
            alice.address,
            aliceBalance.add(1),
          ),
        ).revertedWith('InsufficientLockedBalance');
      });

      it('Fail to lock user balance due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.lock(targetCurrency, alice.address, 100),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });

      it('Fail to unlock user balance due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.unlock(targetCurrency, alice.address, 100),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });
    });

    describe('Transfer balance', async () => {
      it('Transfer balance to another user', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await expect(
          genesisValueVaultCaller.transferFrom(
            targetCurrency,
            alice.address,
            bob.address,
            aliceBalance,
          ),
        )
          .emit(genesisValueVaultProxy, 'Transfer')
          .withArgs(targetCurrency, alice.address, bob.address, aliceBalance);
      });

      it('Fail to transfer balance to another user due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.transferFrom(
            targetCurrency,
            alice.address,
            bob.address,
            1,
          ),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });
    });

    describe('Reset balance', async () => {
      it("Force reset a user's empty balance with amount", async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await expect(
          genesisValueVaultCaller[
            'executeForcedReset(bytes32,uint256,address,int256)'
          ](targetCurrency, maturity, alice.address, fvAmount),
        )
          .emit(genesisValueVaultProxy, 'Transfer')
          .withArgs(
            targetCurrency,
            alice.address,
            ethers.constants.AddressZero,
            aliceBalance,
          );
      });

      it("Force reset a user's empty balance with small amount", async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await expect(
          genesisValueVaultCaller[
            'executeForcedReset(bytes32,uint256,address,int256)'
          ](targetCurrency, maturity, alice.address, fvAmount.div(2)),
        )
          .emit(genesisValueVaultProxy, 'Transfer')
          .withArgs(
            targetCurrency,
            alice.address,
            ethers.constants.AddressZero,
            aliceBalance.div(2),
          );
      });

      it("Force reset a user's empty balance without amount", async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        const aliceBalance = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
        );

        await expect(
          genesisValueVaultCaller['executeForcedReset(bytes32,address)'](
            targetCurrency,
            alice.address,
          ),
        )
          .emit(genesisValueVaultProxy, 'Transfer')
          .withArgs(
            targetCurrency,
            alice.address,
            ethers.constants.AddressZero,
            aliceBalance,
          );
      });

      it("Fail to force reset a user's balance due to lending amount mismatch", async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          fvAmount,
        );

        await expect(
          genesisValueVaultCaller[
            'executeForcedReset(bytes32,uint256,address,int256)'
          ](targetCurrency, maturity, alice.address, -fvAmount),
        ).revertedWith('InvalidAmount');
      });

      it("Fail to force reset a user's balance due to borrowing amount mismatch", async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount,
        );

        await expect(
          genesisValueVaultCaller[
            'executeForcedReset(bytes32,uint256,address,int256)'
          ](targetCurrency, maturity, alice.address, fvAmount),
        ).revertedWith('InvalidAmount');
      });

      it("Fail to force reset a user's balance without amount due to execution by non-accepted contract", async () => {
        await expect(
          genesisValueVaultProxy['executeForcedReset(bytes32,address)'](
            targetCurrency,
            alice.address,
          ),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });

      it("Fail to force reset a user's balance with amount due to execution by non-accepted contract", async () => {
        await expect(
          genesisValueVaultProxy[
            'executeForcedReset(bytes32,uint256,address,int256)'
          ](targetCurrency, maturity, alice.address, fvAmount),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });
    });

    describe('Clean up balance', async () => {
      it('Clean up a user balance', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount,
        );

        await expect(
          genesisValueVaultCaller.cleanUpBalance(
            targetCurrency,
            alice.address,
            maturity,
          ),
        ).not.emit(genesisValueVaultProxy, 'Transfer');
      });

      it('Clean up a user balance with fluctuation', async () => {
        await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
          targetCurrency,
          alice.address,
          maturity,
          -fvAmount,
        );

        await genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          8000,
          1000,
        );

        await expect(
          genesisValueVaultCaller.cleanUpBalance(
            targetCurrency,
            alice.address,
            nextMaturity,
          ),
        ).emit(genesisValueVaultProxy, 'Transfer');
      });

      it('Fail to clean up a user balance due to execution by non-accepted contract', async () => {
        await expect(
          genesisValueVaultProxy.cleanUpBalance(
            targetCurrency,
            alice.address,
            maturity,
          ),
        ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
      });
    });
  });

  describe('Auto-roll', async () => {
    beforeEach(async () => {
      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );
    });

    it('Execute auto-roll', async () => {
      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        alice.address,
        maturity,
        fvAmount,
      );

      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        bob.address,
        maturity,
        -fvAmount,
      );

      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          unitPrice,
          4000,
        ),
      )
        .emit(genesisValueVaultProxy, 'AutoRollExecuted')
        .withArgs(
          targetCurrency,
          () => true,
          () => true,
          unitPrice,
          nextMaturity,
          maturity,
        );

      expect(
        await genesisValueVaultProxy.getCurrentMaturity(targetCurrency),
      ).to.equals(nextMaturity);

      const aliceBalance =
        await genesisValueVaultProxy.getBalanceFluctuationByAutoRolls(
          targetCurrency,
          alice.address,
          nextMaturity,
        );

      const bobBalance =
        await genesisValueVaultProxy.getBalanceFluctuationByAutoRolls(
          targetCurrency,
          bob.address,
          nextMaturity,
        );

      expect(aliceBalance).to.equals(0);
      expect(bobBalance).lt(0);

      const lendingCompoundFactor =
        await genesisValueVaultProxy.getLendingCompoundFactor(targetCurrency);
      const borrowingCompoundFactor =
        await genesisValueVaultProxy.getBorrowingCompoundFactor(targetCurrency);
      const autoRollLog = await genesisValueVaultProxy.getLatestAutoRollLog(
        targetCurrency,
      );
      const compoundFactor = initialCompoundFactor.mul(10000).div(8000);

      expect(lendingCompoundFactor).to.lt(compoundFactor);
      expect(borrowingCompoundFactor).to.gt(compoundFactor);
      expect(autoRollLog.unitPrice).to.equals(unitPrice);
      expect(autoRollLog.prev).to.equals(maturity);
      expect(autoRollLog.next).to.equals(0);
      expect(autoRollLog.lendingCompoundFactor).to.equals(
        lendingCompoundFactor,
      );
      expect(autoRollLog.borrowingCompoundFactor).to.equals(
        borrowingCompoundFactor,
      );
    });

    it('Calculate the balance fluctuation of auto-rolls by on the current maturity', async () => {
      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        mockReserveFund.address,
        maturity,
        -fvAmount,
      );

      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        nextMaturity,
        8000,
        1000,
      );

      const fluctuation =
        await genesisValueVaultProxy.calculateBalanceFluctuationByAutoRolls(
          targetCurrency,
          -fvAmount,
          maturity,
          nextMaturity,
        );

      expect(fluctuation).lt(0);
    });

    it('Calculate the balance fluctuation of auto-rolls by on the future maturity', async () => {
      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        nextMaturity,
        8000,
        1000,
      );

      const fluctuation =
        await genesisValueVaultProxy.calculateBalanceFluctuationByAutoRolls(
          targetCurrency,
          -fvAmount,
          maturity,
          nextMaturity + 1,
        );

      expect(fluctuation).to.equal(0);
    });

    it('Calculate the balance fluctuation of auto-rolls by on the past maturity', async () => {
      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        mockReserveFund.address,
        maturity,
        -fvAmount,
      );

      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        nextMaturity,
        8000,
        1000,
      );

      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        nextMaturity,
        nextMaturity * 2,
        8000,
        1000,
      );

      const fluctuation =
        await genesisValueVaultProxy.calculateBalanceFluctuationByAutoRolls(
          targetCurrency,
          -fvAmount,
          maturity,
          nextMaturity,
        );

      expect(fluctuation).lt(0);
    });

    it('Calculate the balance fluctuation of auto-rolls with invalid maturity', async () => {
      const fluctuation =
        await genesisValueVaultProxy.calculateBalanceFluctuationByAutoRolls(
          targetCurrency,
          -fvAmount,
          nextMaturity,
          maturity,
        );

      expect(fluctuation).to.equals(0);
    });

    it('Fail to execute auto-roll due to duplicate execution', async () => {
      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          unitPrice,
          4000,
        ),
      ).emit(genesisValueVaultProxy, 'AutoRollExecuted');

      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          unitPrice,
          4000,
        ),
      ).revertedWith('AutoRollLogAlreadyUpdated');
    });

    it('Fail to execute auto-roll due to execution by non-accepted contract', async () => {
      await expect(
        genesisValueVaultProxy.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          unitPrice,
          4000,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to execute auto-roll due to invalid order fee rate', async () => {
      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          unitPrice,
          10001,
        ),
      ).revertedWith('InvalidOrderFeeRate');
    });

    it('Fail to execute auto-roll due to zero unit price', async () => {
      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          nextMaturity,
          0,
          4000,
        ),
      ).revertedWith('UnitPriceIsZero');
    });

    it('Fail to execute auto-roll due to invalid maturity', async () => {
      await expect(
        genesisValueVaultCaller.executeAutoRoll(
          targetCurrency,
          maturity,
          maturity,
          unitPrice,
          4000,
        ),
      ).revertedWith('InvalidMaturity');
    });
  });
});
