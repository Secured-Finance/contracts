import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ReserveFund = artifacts.require('ReserveFund');
const ProxyController = artifacts.require('ProxyController');
const WETH9 = artifacts.require('MockWETH9');
const MockERC20 = artifacts.require('MockERC20');
const TokenVaultCaller = artifacts.require('TokenVaultCaller');

// libraries
const DepositManagementLogic = artifacts.require('DepositManagementLogic');

const { deployContract, deployMockContract } = waffle;

describe('TokenVault', () => {
  let mockCurrencyController: MockContract;
  let mockLendingMarketController: MockContract;
  let mockReserveFund: MockContract;
  let mockWETH: MockContract;
  let mockERC20: MockContract;

  let tokenVaultProxy: Contract;
  let tokenVaultCaller: Contract;
  let depositManagementLogic: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;
  let signers: SignerWithAddress[];

  let targetCurrency: string;
  let previousCurrency: string;
  let currencyIdx = 0;

  const getUser = (): SignerWithAddress => {
    const signer = signers.shift();
    if (!signer) {
      throw new Error('No user exists');
    }
    return signer;
  };

  before(async () => {
    [owner, alice, bob, carol, dave, ellen, ...signers] =
      await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
    mockLendingMarketController = await deployMockContract(
      owner,
      LendingMarketController.abi,
    );
    mockWETH = await deployMockContract(owner, WETH9.abi);
    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockWETH.mock.transferFrom.returns(true);
    await mockWETH.mock.transfer.returns(true);
    await mockWETH.mock.approve.returns(true);
    await mockWETH.mock.deposit.returns();
    await mockERC20.mock.transferFrom.returns(true);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.approve.returns(true);
    await mockLendingMarketController.mock.cleanUpFunds.returns(0);
    await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
      0,
    );
    await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    );
    await mockLendingMarketController.mock.calculateFunds.returns(
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    );

    // Deploy libraries
    depositManagementLogic = await deployContract(
      owner,
      DepositManagementLogic,
    );

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const tokenVault = await ethers
      .getContractFactory('TokenVault', {
        libraries: {
          DepositManagementLogic: depositManagementLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const tokenVaultAddress = await proxyController
      .setTokenVaultImpl(
        tokenVault.address,
        LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PROTOCOL_FEE_RATE,
        LIQUIDATOR_FEE_RATE,
        mockWETH.address,
      )
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    tokenVaultProxy = await ethers.getContractAt(
      'TokenVault',
      tokenVaultAddress,
    );

    // Deploy TokenVaultCaller
    tokenVaultCaller = await deployContract(owner, TokenVaultCaller, [
      tokenVaultProxy.address,
      mockLendingMarketController.address,
    ]);

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['CurrencyController', mockCurrencyController],
      ['TokenVault', tokenVaultProxy],
      ['ReserveFund', mockReserveFund],
      ['LendingMarketController', tokenVaultCaller],
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
    await migrationAddressResolver.buildCaches([tokenVaultProxy.address]);
  });

  beforeEach(async () => {
    previousCurrency = targetCurrency;
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;
  });

  describe('Initialize', async () => {
    it('Update the liquidation configuration', async () => {
      const updateLiquidationConfiguration = async (
        liquidationThresholdRate: number,
      ) => {
        await tokenVaultProxy.updateLiquidationConfiguration(
          liquidationThresholdRate,
          LIQUIDATION_PROTOCOL_FEE_RATE,
          LIQUIDATOR_FEE_RATE,
        );
        const params = await tokenVaultProxy.getLiquidationConfiguration();

        expect(params.liquidationThresholdRate).to.equal(
          liquidationThresholdRate.toString(),
        );
      };

      await updateLiquidationConfiguration(1000);
      await updateLiquidationConfiguration(LIQUIDATION_THRESHOLD_RATE);
    });

    it('Register a currency', async () => {
      expect(await tokenVaultProxy.isRegisteredCurrency(targetCurrency)).to
        .false;

      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          mockERC20.address,
          true,
        ),
      ).to.emit(tokenVaultProxy, 'CurrencyRegistered');

      expect(await tokenVaultProxy.isRegisteredCurrency(targetCurrency)).true;

      const collateralCurrencies =
        await tokenVaultProxy.getCollateralCurrencies();
      expect(collateralCurrencies.length).to.equal(1);
      expect(collateralCurrencies[0]).to.equal(targetCurrency);
    });

    it('Fail to call updateLiquidationConfiguration due to invalid rate', async () => {
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration('0', '1', '1'),
      ).to.be.revertedWith('InvalidLiquidationThresholdRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration('1', '10001', '1'),
      ).to.be.revertedWith('InvalidLiquidationProtocolFeeRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration('1', '1', '10001'),
      ).to.be.revertedWith('InvalidLiquidatorFeeRate');
    });
  });

  describe('Coverage', async () => {
    const value = BigNumber.from('20000000000000');
    const CALCULATE_COVERAGE_INPUTS = {
      ccy: '',
      workingLendOrdersAmount: 0,
      claimableAmount: 0,
      workingBorrowOrdersAmount: 0,
      debtAmount: 0,
      lentAmount: 0,
      borrowedAmount: 0,
    };

    const updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock =
      async (inputs: {
        plusDepositAmountInAdditionalFundsCcy?: number | BigNumber | string;
        minusDepositAmountInAdditionalFundsCcy?: number | BigNumber | string;
        workingLendOrdersAmount?: number | BigNumber | string;
        claimableAmount?: number | BigNumber | string;
        collateralAmount?: number | BigNumber | string;
        lentAmount?: number | BigNumber | string;
        workingBorrowOrdersAmount?: number | BigNumber | string;
        debtAmount?: number | BigNumber | string;
        borrowedAmount?: number | BigNumber | string;
        isEnoughDepositInAdditionalFundsCcy?: boolean;
      }) => {
        return mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
          inputs.plusDepositAmountInAdditionalFundsCcy || 0,
          inputs.minusDepositAmountInAdditionalFundsCcy || 0,
          inputs.workingLendOrdersAmount || 0,
          inputs.claimableAmount || 0,
          inputs.collateralAmount || 0,
          inputs.lentAmount || 0,
          inputs.workingBorrowOrdersAmount || 0,
          inputs.debtAmount || 0,
          inputs.borrowedAmount || 0,
        );
      };

    before(async () => {
      await mockLendingMarketController.mock.isTerminated.returns(false);
    });

    beforeEach(async () => {
      CALCULATE_COVERAGE_INPUTS.ccy = targetCurrency;

      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );

      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      );
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(0);
    });

    it('Calculate the coverage without deposit', async () => {
      const signer = getUser();

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal('0');
      await tokenVaultProxy
        .calculateCoverage(signer.address, CALCULATE_COVERAGE_INPUTS)
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal('0');
          expect(isInsufficientDepositAmount).to.equal(false);
        });
    });

    it('Calculate the coverage with deposit', async () => {
      const signer = getUser();

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(value);

      await expect(
        tokenVaultProxy.connect(signer).deposit(targetCurrency, value),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(signer.address, targetCurrency, value);

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal('0');

      await tokenVaultProxy
        .calculateCoverage(signer.address, CALCULATE_COVERAGE_INPUTS)
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal(0);
          expect(isInsufficientDepositAmount).to.equal(false);
        });

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount: value.div(2),
      });

      await tokenVaultProxy
        .calculateCoverage(signer.address, CALCULATE_COVERAGE_INPUTS)
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal(5000);
          expect(isInsufficientDepositAmount).to.equal(false);
        });
    });

    it('Calculate the coverage for borrowing orders', async () => {
      const signer = getUser();

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount: value,
      });

      await tokenVaultProxy
        .calculateCoverage(signer.address, CALCULATE_COVERAGE_INPUTS)
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal(ethers.constants.MaxUint256);
          expect(isInsufficientDepositAmount).to.equal(false);
        });
    });

    it('Calculate the coverage for lending orders', async () => {
      const signer = getUser();

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        lentAmount: value,
      });

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      await tokenVaultProxy
        .calculateCoverage(signer.address, CALCULATE_COVERAGE_INPUTS)
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal(0);
          expect(isInsufficientDepositAmount).to.equal(false);
        });
    });

    it('Calculate the coverage for lending orders that exceed the deposit amount.', async () => {
      const signer = getUser();

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        plusDepositAmountInAdditionalFundsCcy: '0',
        minusDepositAmountInAdditionalFundsCcy: value.mul(2),
        lentAmount: value.mul(2),
      });

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      await tokenVaultProxy
        .calculateCoverage(signer.address, {
          ...CALCULATE_COVERAGE_INPUTS,
          lentAmount: value,
        })
        .then(({ coverage, isInsufficientDepositAmount }) => {
          expect(coverage).to.equal(0);
          expect(isInsufficientDepositAmount).to.equal(true);
        });
    });
  });

  describe('Deposit & Withdraw', async () => {
    const ETH = ethers.utils.formatBytes32String('ETH');

    before(async () => {
      await tokenVaultProxy.registerCurrency(ETH, mockWETH.address, true);
    });

    beforeEach(async () => {
      await mockLendingMarketController.mock.isTerminated.returns(false);
      await mockLendingMarketController.mock.isRedemptionRequired.returns(
        false,
      );

      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    it('Deposit into collateral book using ERC20', async () => {
      const value = '10000000000000';
      const valueInETH = '20000000000000';

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, value),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value);

      const currencies = await tokenVaultProxy.getUsedCurrencies(alice.address);
      expect(currencies[0]).to.equal(targetCurrency);

      const depositAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        targetCurrency,
      );
      expect(depositAmount).to.equal(value);

      const collateralAmount = await tokenVaultProxy.getCollateralAmount(
        alice.address,
        targetCurrency,
      );

      expect(collateralAmount).to.equal(value);

      const totalDepositAmount = await tokenVaultProxy.getTotalDepositAmount(
        targetCurrency,
      );
      expect(totalDepositAmount).to.equal(depositAmount);
    });

    it('Deposit into collateral book using ETH', async () => {
      const valueInETH = '20000000000000';

      await expect(
        tokenVaultProxy
          .connect(alice)
          .deposit(ETH, valueInETH, { value: valueInETH }),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, ETH, valueInETH);

      const currencies = await tokenVaultProxy.getUsedCurrencies(alice.address);
      expect(currencies.includes(ETH)).to.true;

      const depositAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        ETH,
      );
      expect(depositAmount).to.equal(valueInETH);

      const totalDepositAmount = await tokenVaultProxy.getTotalDepositAmount(
        ETH,
      );
      expect(totalDepositAmount).to.equal(depositAmount);
    });

    it('Add the working orders & Withdraw', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const usedValue = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256[])'
      ].returns([valueInETH, valueInETH, valueInETH]);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );

      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      );

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('0');
      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToBaseCurrency".
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, value);
      await tokenVaultProxy.connect(bob).deposit(previousCurrency, value);

      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );

      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        usedValue,
        0,
        0,
      );

      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );
      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          bob.address,
        ),
      ).to.equal(
        valueInETH
          .mul('2')
          .mul('10000')
          .sub(valueInETH.div('2').mul(LIQUIDATION_THRESHOLD_RATE))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('2500');
      expect(await tokenVaultProxy.getUnusedCollateral(bob.address)).to.equal(
        valueInETH.mul(2).sub(usedValue),
      );

      await expect(
        tokenVaultProxy.connect(bob).withdraw(targetCurrency, '10000000000000'),
      ).to.emit(tokenVaultProxy, 'Withdraw');

      const totalDepositAmount = await tokenVaultProxy.getTotalDepositAmount(
        targetCurrency,
      );
      expect(totalDepositAmount).to.equal('10000000000000');
    });

    it('Add the borrowed amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const borrowedAmount = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        borrowedAmount,
      );

      await tokenVaultProxy.connect(carol).deposit(targetCurrency, value);

      expect(await tokenVaultProxy.getUnusedCollateral(carol.address)).to.equal(
        valueInETH.add(borrowedAmount),
      );
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(carol.address),
      ).to.equal(value.add(borrowedAmount));
    });

    it('Add the debt amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const debtAmount = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
      );

      await tokenVaultProxy.connect(dave).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          dave.address,
        ),
      ).to.equal(
        valueInETH
          .mul('10000')
          .sub(debtAmount.mul(LIQUIDATION_THRESHOLD_RATE))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(dave.address)).to.equal('5000');
      expect(await tokenVaultProxy.getUnusedCollateral(dave.address)).to.equal(
        valueInETH.sub(debtAmount),
      );
    });

    it('Add the debt amount with unsettled order amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const debtAmount = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
      );

      await tokenVaultProxy.connect(ellen).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          ellen.address,
        ),
      ).to.equal(
        valueInETH
          .mul('10000')
          .sub(debtAmount.mul(LIQUIDATION_THRESHOLD_RATE))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(ellen.address)).to.equal('5000');
    });

    it('Add and remove the collateral amount', async () => {
      const signer = getUser();

      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      );

      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signer.address),
      ).to.equal(value);
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(signer)
        .removeDepositAmount(signer.address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signer.address),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal('0');
    });

    it('Reset the collateral amount', async () => {
      const signer = getUser();

      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      );

      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(signer)
        .executeForcedReset(signer.address, targetCurrency);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signer.address),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal('0');
    });

    it('Add an amount in a currency that is not accepted as collateral', async () => {
      const signer = getUser();
      const value = '10000000000000';
      const valueInETH = '20000000000000';
      const debtAmount = '5000000000000';

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
      );

      const nonCollateralCurrency = ethers.utils.formatBytes32String(
        `Test${currencyIdx}`,
      );
      await tokenVaultProxy.registerCurrency(
        nonCollateralCurrency,
        mockERC20.address,
        false,
      );

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);
      await tokenVaultProxy
        .connect(signer)
        .deposit(nonCollateralCurrency, value);

      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal(valueInETH);

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '2500',
      );
      expect(await tokenVaultProxy['isCovered(address)'](signer.address)).to
        .true;

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(debtAmount);

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );
      expect(await tokenVaultProxy['isCovered(address)'](signer.address)).to
        .false;
    });

    it('Get the withdrawable amount', async () => {
      const signer = getUser();
      const value = ethers.BigNumber.from('30000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(value);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      );

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          signer.address,
        ),
      ).to.equal(valueInETH);
      expect(
        await tokenVaultProxy['getWithdrawableCollateral(bytes32,address)'](
          targetCurrency,
          signer.address,
        ),
      ).to.equal(value);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(bytes32,address)'](
          targetCurrency,
          signer.address,
        ),
      ).to.equal(valueInETH);
    });

    it('Get the liquidation amount', async () => {
      const signer = getUser();
      const value = ethers.BigNumber.from('30000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const debtAmount = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([valueInETH, valueInETH]);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
      );

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          signer.address,
        ),
      ).to.equal('0');

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );

      const liquidationAmounts = await tokenVaultProxy.getLiquidationAmount(
        signer.address,
        targetCurrency,
        value,
      );

      expect(liquidationAmounts.liquidationAmount).to.equal(debtAmount);
    });

    it('Get the liquidation amount decreased by a maximum', async () => {
      const signer = getUser();
      const value = ethers.BigNumber.from('30000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const debtAmount = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,int256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
      );

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          signer.address,
        ),
      ).to.equal('0');

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );

      const liquidationAmounts = await tokenVaultProxy.getLiquidationAmount(
        signer.address,
        targetCurrency,
        debtAmount,
      );

      expect(liquidationAmounts.liquidationAmount).to.equal(debtAmount);
    });

    it('Fail to call addDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.addDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('OnlyAcceptedContracts');
    });

    it('Fail to call removeDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.removeDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('OnlyAcceptedContracts');
    });

    it('Fail to call executeForcedReset due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.executeForcedReset(alice.address, targetCurrency),
      ).to.be.revertedWith('OnlyAcceptedContracts');
    });

    it('Fail to call addDepositAmount due to invalid amount', async () => {
      const amount = ethers.BigNumber.from('20000000000000');
      await tokenVaultCaller.addDepositAmount(
        carol.address,
        targetCurrency,
        amount,
      );

      await expect(
        tokenVaultCaller.removeDepositAmount(
          carol.address,
          targetCurrency,
          amount.add('1'),
        ),
      ).to.be.revertedWith('NotEnoughDeposit');
    });

    it('Fail to call deposit due to invalid amount', async () => {
      await expect(tokenVaultProxy.deposit(ETH, '100')).to.be.revertedWith(
        'InvalidAmount',
      );
    });

    it('Fail to call deposit due to lending market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultProxy.deposit(targetCurrency, '100'),
      ).to.be.revertedWith('MarketTerminated');
    });

    it('Fail to withdraw due to redemption required', async () => {
      await mockLendingMarketController.mock.isRedemptionRequired.returns(true);

      await expect(
        tokenVaultProxy.withdraw(targetCurrency, '10000000000000'),
      ).to.be.revertedWith('RedemptionIsRequired');
    });

    it('Fail to withdraw due to insolvency', async () => {
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns('10000000000000');
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns('10000000000000');

      await tokenVaultCaller.addDepositAmount(
        owner.address,
        targetCurrency,
        '10000000000000',
      );

      await expect(
        tokenVaultProxy.withdraw(targetCurrency, '10000000000000'),
      ).to.be.revertedWith(`ProtocolIsInsolvent("${targetCurrency}")`);
    });

    it('Fail to get liquidation amount due to no collateral', async () => {
      await expect(
        depositManagementLogic
          .attach(tokenVaultProxy.address)
          .getLiquidationAmount(owner.address, targetCurrency, 1),
      ).to.be.revertedWith('CollateralIsZero');
    });

    it('Deposit funds from Alice', async () => {
      const valueInETH = '10000';

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      await expect(
        tokenVaultCaller.depositFrom(alice.address, targetCurrency, valueInETH),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, valueInETH);
    });

    it('Withdraw funds from Alice', async () => {
      const valueInETH = '10000';

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      await tokenVaultCaller.depositFrom(
        alice.address,
        targetCurrency,
        valueInETH,
      );

      await expect(
        tokenVaultProxy.connect(alice).withdraw(targetCurrency, valueInETH),
      )
        .to.emit(tokenVaultProxy, 'Withdraw')
        .withArgs(alice.address, targetCurrency, valueInETH);
    });
  });

  describe('Transfer', async () => {
    beforeEach(async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    it('Transfer from Alice to Bob', async () => {
      const value = '10000';

      await tokenVaultProxy.connect(alice).deposit(targetCurrency, value);

      const [aliceCollateralAmountBefore, bobCollateralAmountBefore] =
        await Promise.all(
          [alice, bob].map(({ address }) =>
            tokenVaultProxy.getDepositAmount(address, targetCurrency),
          ),
        );

      await expect(
        tokenVaultCaller.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          value,
        ),
      )
        .to.emit(tokenVaultProxy, 'Transfer')
        .withArgs(targetCurrency, alice.address, bob.address, value);

      const [aliceCollateralAmountAfter, bobCollateralAmountAfter] =
        await Promise.all(
          [alice, bob].map(({ address }) =>
            tokenVaultProxy.getDepositAmount(address, targetCurrency),
          ),
        );

      expect(
        aliceCollateralAmountBefore.sub(aliceCollateralAmountAfter),
      ).to.equal(value);
      expect(bobCollateralAmountAfter.sub(bobCollateralAmountBefore)).to.equal(
        value,
      );
    });

    it('Transfer from Alice to Bob with over amount', async () => {
      const depositAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        targetCurrency,
      );
      await expect(
        tokenVaultCaller.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          depositAmount.add(1),
        ),
      )
        .to.emit(tokenVaultProxy, 'Transfer')
        .withArgs(targetCurrency, alice.address, bob.address, depositAmount);
    });

    it('Fail to transfer deposits due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          1,
        ),
      ).to.be.revertedWith('OnlyAcceptedContracts');
    });
  });

  describe('Pause/Unpause operations', async () => {
    const arbitraryAmount = '1000';

    beforeEach(async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    it('Pause token vault', async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );

      await tokenVaultProxy.pauseVault();
      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, arbitraryAmount),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultCaller.depositFrom(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultCaller.addDepositAmount(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultCaller.removeDepositAmount(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultCaller.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          arbitraryAmount,
        ),
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Unpause token vault', async () => {
      await tokenVaultProxy.unpauseVault();

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, arbitraryAmount),
      ).to.be.not.reverted;

      tokenVaultCaller.depositFrom(
        alice.address,
        targetCurrency,
        arbitraryAmount,
      );
      await expect(
        tokenVaultCaller.depositFrom(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.not.reverted;

      await expect(
        tokenVaultCaller.addDepositAmount(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.not.reverted;

      await expect(
        tokenVaultCaller.removeDepositAmount(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.not.reverted;

      await expect(
        tokenVaultCaller.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          arbitraryAmount,
        ),
      ).to.be.not.reverted;
    });
  });
});
