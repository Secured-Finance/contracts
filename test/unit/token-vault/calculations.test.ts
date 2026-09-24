import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../../common/constants';

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

describe('TokenVault - Calculations', () => {
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
  let signers: SignerWithAddress[];

  let targetCurrency: string;
  let currencyIdx = 0;

  const getUser = (): SignerWithAddress => {
    const signer = signers.shift();
    if (!signer) {
      throw new Error('No user exists');
    }
    return signer;
  };

  const updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock = async (
    inputs: {
      plusDepositAmountInAdditionalFundsCcy?: number | BigNumber | string;
      minusDepositAmountInAdditionalFundsCcy?: number | BigNumber | string;
      workingLendOrdersAmount?: number | BigNumber | string;
      claimableAmount?: number | BigNumber | string;
      collateralAmount?: number | BigNumber | string;
      lentAmount?: number | BigNumber | string;
      workingBorrowOrdersAmount?: number | BigNumber | string;
      debtAmount?: number | BigNumber | string;
      borrowedAmount?: number | BigNumber | string;
    } = {},
  ) => {
    return mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
      {
        plusDepositAmountInAdditionalFundsCcy:
          inputs.plusDepositAmountInAdditionalFundsCcy || 0,
        minusDepositAmountInAdditionalFundsCcy:
          inputs.minusDepositAmountInAdditionalFundsCcy || 0,
        workingLendOrdersAmount: inputs.workingLendOrdersAmount || 0,
        claimableAmount: inputs.claimableAmount || 0,
        collateralAmount: inputs.collateralAmount || 0,
        lentAmount: inputs.lentAmount || 0,
        workingBorrowOrdersAmount: inputs.workingBorrowOrdersAmount || 0,
        debtAmount: inputs.debtAmount || 0,
        borrowedAmount: inputs.borrowedAmount || 0,
      },
    );
  };

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();

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

    await mockWETH.mock.transferFrom.returns(true);
    await mockWETH.mock.transfer.returns(true);
    await mockWETH.mock.approve.returns(true);
    await mockWETH.mock.deposit.returns();
    await mockERC20.mock.transferFrom.returns(true);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.approve.returns(true);
    await mockERC20.mock.permit.returns();
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockLendingMarketController.mock.isTerminated.returns(false);
    await mockLendingMarketController.mock.cleanUpFunds.returns(0);
    await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
      0,
    );
    await mockLendingMarketController.mock.calculateFunds.returns({
      workingLendOrdersAmount: 0,
      claimableAmount: 0,
      collateralAmount: 0,
      unallocatedCollateralAmount: 0,
      lentAmount: 0,
      workingBorrowOrdersAmount: 0,
      debtAmount: 0,
      borrowedAmount: 0,
    });
    await mockLendingMarketController.mock.getUsedCurrencies.returns([]);

    await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

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
        FULL_LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PROTOCOL_FEE_RATE,
        LIQUIDATOR_FEE_RATE,
        mockWETH.address,
      )
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
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockLendingMarketController.mock.isTerminated.returns(false);
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

    beforeEach(async () => {
      CALCULATE_COVERAGE_INPUTS.ccy = targetCurrency;

      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

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
        .withArgs(signer.address, targetCurrency, value, signer.address);

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

  describe('Borrowable amount calculations', async () => {
    beforeEach(async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    const conditions = [
      {
        title: 'Without collateral',
        totalCollateralAmount: '0',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '0',
          collateralAmount: '0',
          unallocatedCollateralAmount: '0',
        },
        result: '0',
      },
      {
        title: 'With collateral, unused',
        totalCollateralAmount: '10000000',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '0',
          collateralAmount: '0',
          unallocatedCollateralAmount: '0',
        },
        result: '8000000',
      },
      {
        title: 'With collateral, partially used',
        totalCollateralAmount: '10000000',
        totalUsedCollateral: '2000000',
        funds: {
          claimableAmount: '0',
          collateralAmount: '0',
          unallocatedCollateralAmount: '0',
        },
        result: '6000000',
      },
      {
        title: 'With collateral, totally used',
        totalCollateralAmount: '10000000',
        totalUsedCollateral: '8000000',
        funds: {
          claimableAmount: '0',
          collateralAmount: '0',
          unallocatedCollateralAmount: '0',
        },
        result: '0',
      },
      {
        title: 'Without collateral, has claimable amount',
        totalCollateralAmount: '0',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '5000000',
          collateralAmount: '0',
          unallocatedCollateralAmount: '5000000',
        },
        result: '4000000',
      },
      {
        title: 'With collateral, has claimable amount',
        totalCollateralAmount: '10000000',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '5000000',
          collateralAmount: '0',
          unallocatedCollateralAmount: '5000000',
        },
        result: '12000000',
      },
      {
        title: 'With collateral, has funds (claimable > collateral)',
        totalCollateralAmount: '11000000',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '5000000',
          collateralAmount: '1000000',
          unallocatedCollateralAmount: '4000000',
        },
        result: '12000000',
      },
      {
        title: 'With collateral, has funds (claimable == collateral)',
        totalCollateralAmount: '15000000',
        totalUsedCollateral: '0',
        funds: {
          claimableAmount: '5000000',
          collateralAmount: '5000000',
          unallocatedCollateralAmount: '0',
        },
        result: '12000000',
      },
    ];

    for (const condition of conditions) {
      it(condition.title, async () => {
        await mockCurrencyController.mock[
          'convertFromBaseCurrency(bytes32,uint256[])'
        ].returns([
          condition.totalCollateralAmount,
          condition.totalUsedCollateral,
        ]);
        await mockLendingMarketController.mock.calculateFunds.returns({
          workingLendOrdersAmount: '0',
          claimableAmount: condition.funds.claimableAmount,
          collateralAmount: condition.funds.collateralAmount,
          unallocatedCollateralAmount:
            condition.funds.unallocatedCollateralAmount,
          lentAmount: '0',
          workingBorrowOrdersAmount: '0',
          debtAmount: '0',
          borrowedAmount: '0',
        });

        const amount = await tokenVaultProxy.getBorrowableAmount(
          alice.address,
          targetCurrency,
        );

        expect(amount).to.equal(condition.result);
      });
    }
  });
});
