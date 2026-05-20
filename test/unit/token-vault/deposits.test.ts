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
  PCT_DIGIT,
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

describe('TokenVault - Deposits', () => {
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
    previousCurrency = targetCurrency;
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockLendingMarketController.mock.isTerminated.returns(false);
  });

  describe('Deposit & Withdraw', async () => {
    const ETH = ethers.utils.formatBytes32String('ETH');

    before(async () => {
      await tokenVaultProxy.registerCurrency(ETH, mockWETH.address, true);
    });

    beforeEach(async () => {
      await mockLendingMarketController.mock.isRedemptionRequired.returns(
        false,
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

      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    it('Deposit ERC20 token', async () => {
      const value = '10000000000000';
      const valueInETH = '20000000000000';

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, value),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value, alice.address);

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

    it('Deposit ETH', async () => {
      const valueInETH = '20000000000000';

      await expect(
        tokenVaultProxy
          .connect(alice)
          .deposit(ETH, valueInETH, { value: valueInETH }),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, ETH, valueInETH, alice.address);

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

    it('Deposit ETH to another user', async () => {
      const valueInETH = '20000000000000';

      await expect(
        tokenVaultProxy
          .connect(carol)
          .depositTo(ETH, valueInETH, dave.address, { value: valueInETH }),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(dave.address, ETH, valueInETH, carol.address);

      const [carolResult, daveResult] = await Promise.all(
        [carol, dave].map(async (user) => {
          const currencies = await tokenVaultProxy.getUsedCurrencies(
            user.address,
          );
          const depositAmount = await tokenVaultProxy.getDepositAmount(
            user.address,
            ETH,
          );

          return { currencies, depositAmount };
        }),
      );

      expect(carolResult.currencies.includes(ETH)).to.false;
      expect(carolResult.depositAmount).to.equal(0);
      expect(daveResult.currencies.includes(ETH)).to.true;
      expect(daveResult.depositAmount).to.equal(valueInETH);
    });

    it('Deposit multiple tokens using multicall', async () => {
      const inputs = [
        [targetCurrency, '10000000000000'],
        [targetCurrency, '20000000000000'],
      ];

      await tokenVaultProxy
        .connect(alice)
        .multicall(
          inputs.map((input) =>
            tokenVaultProxy.interface.encodeFunctionData('deposit', input),
          ),
        );

      const depositAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        targetCurrency,
      );
      expect(depositAmount).to.equal('30000000000000');
    });

    it('Deposit to another user with permit', async () => {
      const value = '10000000000000';
      const deadline = ethers.constants.MaxUint256;
      const v = 1;
      const r = ethers.utils.formatBytes32String('dummy');
      const s = ethers.utils.formatBytes32String('dummy');

      await expect(
        tokenVaultProxy
          .connect(owner)
          .depositWithPermitTo(
            targetCurrency,
            value,
            alice.address,
            deadline,
            v,
            r,
            s,
          ),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value, owner.address);
    });

    it('Deposit from another user with permit', async () => {
      const value = '10000000000000';
      const deadline = ethers.constants.MaxUint256;
      const v = 1;
      const r = ethers.utils.formatBytes32String('dummy');
      const s = ethers.utils.formatBytes32String('dummy');

      await expect(
        tokenVaultCaller
          .connect(owner)
          .depositWithPermitFrom(
            alice.address,
            targetCurrency,
            value,
            deadline,
            v,
            r,
            s,
          ),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value, alice.address);
    });

    it('Get the withdrawable amount with the working orders & Withdraw collateral', async () => {
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('0');

      await tokenVaultProxy
        .isCovered(bob.address, ethers.constants.HashZero)
        .then(({ isEnoughCollateral, isEnoughDepositInOrderCcy }) => {
          expect(isEnoughCollateral).to.equal(true);
          expect(isEnoughDepositInOrderCcy).to.equal(true);
        });

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToBaseCurrency".
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, value);
      await tokenVaultProxy.connect(bob).deposit(previousCurrency, value);

      await tokenVaultProxy
        .isCovered(bob.address, ethers.constants.HashZero)
        .then(({ isEnoughCollateral, isEnoughDepositInOrderCcy }) => {
          expect(isEnoughCollateral).to.equal(true);
          expect(isEnoughDepositInOrderCcy).to.equal(true);
        });
      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        workingBorrowOrdersAmount: usedValue,
      });

      await tokenVaultProxy
        .isCovered(bob.address, ethers.constants.HashZero)
        .then(({ isEnoughCollateral, isEnoughDepositInOrderCcy }) => {
          expect(isEnoughCollateral).to.equal(true);
          expect(isEnoughDepositInOrderCcy).to.equal(true);
        });

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
      expect(
        await tokenVaultProxy.getTotalUnusedCollateralAmount(bob.address),
      ).to.equal(valueInETH.mul(2).sub(usedValue));

      await expect(
        tokenVaultProxy.connect(bob).withdraw(targetCurrency, '10000000000000'),
      ).to.emit(tokenVaultProxy, 'Withdraw');

      const totalDepositAmount = await tokenVaultProxy.getTotalDepositAmount(
        targetCurrency,
      );
      expect(totalDepositAmount).to.equal('10000000000000');
    });

    it('Get the withdrawable amount with the borrowed amount', async () => {
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        borrowedAmount,
      });

      await tokenVaultProxy.connect(carol).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getTotalUnusedCollateralAmount(carol.address),
      ).to.equal(valueInETH.add(borrowedAmount));
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(carol.address),
      ).to.equal(valueInETH.add(borrowedAmount));

      const { totalCollateral, totalUsedCollateral, totalDeposit } =
        await tokenVaultProxy.getCollateralDetail(carol.address);

      expect(totalCollateral).to.equal(valueInETH.add(borrowedAmount));
      expect(totalUsedCollateral).to.equal(0);
      expect(totalDeposit).to.equal(value.add(borrowedAmount));
    });

    it('Get the withdrawable amount with with the debt amount', async () => {
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount,
      });

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
      expect(
        await tokenVaultProxy.getTotalUnusedCollateralAmount(ellen.address),
      ).to.equal(valueInETH.sub(debtAmount));
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getTotalUnusedCollateralAmount(signer.address),
      ).to.equal(value);
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(signer)
        .removeDepositAmount(signer.address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getTotalUnusedCollateralAmount(signer.address),
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

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
        await tokenVaultProxy.getTotalUnusedCollateralAmount(signer.address),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signer.address),
      ).to.equal('0');

      const currencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(currencies.includes(targetCurrency)).to.false;
    });

    it('Add an amount in a currency that is not accepted as collateral', async () => {
      const signer = getUser();
      const value = '10000000000000';
      const valueInETH = '20000000000000';
      const debtAmount = '5000000000000';

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount,
      });

      const nonCollateralCurrency = ethers.utils.formatBytes32String('Dummy1');
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

      await tokenVaultProxy
        .isCovered(signer.address, ethers.constants.HashZero)
        .then(({ isEnoughCollateral, isEnoughDepositInOrderCcy }) => {
          expect(isEnoughCollateral).to.equal(true);
          expect(isEnoughDepositInOrderCcy).to.equal(true);
        });

      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(debtAmount);

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );
      await tokenVaultProxy
        .isCovered(signer.address, ethers.constants.HashZero)
        .then(({ isEnoughCollateral, isEnoughDepositInOrderCcy }) => {
          expect(isEnoughCollateral).to.equal(false);
          expect(isEnoughDepositInOrderCcy).to.equal(true);
        });
    });

    it('Get the withdrawable amount per currency', async () => {
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

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
      ).to.equal(value);
    });

    it('Get the withdrawable amount per currency with the borrowing working orders', async () => {
      const signer = getUser();
      const value = ethers.BigNumber.from('30000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const usedValue = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(value);

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        workingBorrowOrdersAmount: usedValue,
      });

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          signer.address,
        ),
      ).to.equal(
        valueInETH.sub(usedValue.mul(LIQUIDATION_THRESHOLD_RATE).div('10000')),
      );
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

    it('Get the withdrawable amount per currency with the lending working orders', async () => {
      const signer = getUser();
      const value = ethers.BigNumber.from('40000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const usedValue = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(value);

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        workingLendOrdersAmount: usedValue,
      });
      await mockLendingMarketController.mock.calculateFunds.returns({
        workingLendOrdersAmount: usedValue,
        claimableAmount: 0,
        collateralAmount: 0,
        unallocatedCollateralAmount: 0,
        lentAmount: 0,
        workingBorrowOrdersAmount: 0,
        debtAmount: 0,
        borrowedAmount: 0,
      });

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(address)'](
          signer.address,
        ),
      ).to.equal(valueInETH.sub(usedValue));
      expect(
        await tokenVaultProxy['getWithdrawableCollateral(bytes32,address)'](
          targetCurrency,
          signer.address,
        ),
      ).to.equal(value.sub(usedValue));

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(valueInETH);

      expect(
        await tokenVaultProxy['getWithdrawableCollateral(bytes32,address)'](
          targetCurrency,
          signer.address,
        ),
      ).to.equal(value.sub(usedValue));
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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount,
      });

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

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount,
      });

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

    it('Get the liquidation fees', async () => {
      const value = ethers.BigNumber.from('10000000000000');
      const fees = await tokenVaultProxy.calculateLiquidationFees(value);

      expect(fees.liquidatorFee).to.equal(
        value.mul(LIQUIDATOR_FEE_RATE).div(PCT_DIGIT),
      );
      expect(fees.protocolFee).to.equal(
        value.mul(LIQUIDATION_PROTOCOL_FEE_RATE).div(PCT_DIGIT),
      );
    });

    it('Get liquidation amount with no collateral', async () => {
      const signer = getUser();

      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock({
        debtAmount: '10000000000',
      });

      const liquidationAmounts = await tokenVaultProxy.getLiquidationAmount(
        signer.address,
        targetCurrency,
        1,
      );

      expect(liquidationAmounts.liquidationAmount).equal(0);
      expect(liquidationAmounts.protocolFee).equal(0);
      expect(liquidationAmounts.liquidatorFee).equal(0);
    });

    it('Get liquidation amount with no used collateral', async () => {
      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns('0');

      const signer = getUser();

      await tokenVaultProxy
        .connect(signer)
        .deposit(targetCurrency, '20000000000');
      await updateReturnValuesOfCalculateTotalFundsInBaseCurrencyMock();

      const liquidationAmounts = await tokenVaultProxy.getLiquidationAmount(
        signer.address,
        targetCurrency,
        1,
      );

      expect(liquidationAmounts.liquidationAmount).equal(0);
      expect(liquidationAmounts.protocolFee).equal(0);
      expect(liquidationAmounts.liquidatorFee).equal(0);
    });

    it('Fail to deposit token due to unregistered currency', async () => {
      await expect(
        tokenVaultProxy.deposit(ethers.utils.formatBytes32String('Dummy'), '1'),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to withdraw token due to unregistered currency', async () => {
      await expect(
        tokenVaultProxy.withdraw(
          ethers.utils.formatBytes32String('Dummy'),
          '1',
        ),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to call addDepositAmount due to unregistered currency', async () => {
      await expect(
        tokenVaultCaller.addDepositAmount(
          alice.address,
          ethers.utils.formatBytes32String('Dummy'),
          '1',
        ),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to call removeDepositAmount due to unregistered currency', async () => {
      await expect(
        tokenVaultCaller.removeDepositAmount(
          alice.address,
          ethers.utils.formatBytes32String('Dummy'),
          '1',
        ),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to call executeForcedReset due to unregistered currency', async () => {
      await expect(
        tokenVaultCaller.executeForcedReset(
          alice.address,
          ethers.utils.formatBytes32String('Dummy'),
        ),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to call transferFrom due to unregistered currency', async () => {
      await expect(
        tokenVaultCaller.transferFrom(
          ethers.utils.formatBytes32String('Dummy'),
          alice.address,
          bob.address,
          '1',
        ),
      ).to.be.revertedWith('UnregisteredCurrency');
    });

    it('Fail to call addDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.addDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to call removeDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.removeDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to call executeForcedReset due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.executeForcedReset(alice.address, targetCurrency),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to call transferFrom due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          '1',
        ),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to call depositWithPermitFrom due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.depositWithPermitFrom(
          alice.address,
          targetCurrency,
          '1',
          '1',
          '1',
          ethers.utils.formatBytes32String('dummy'),
          ethers.utils.formatBytes32String('dummy'),
        ),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
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

    it('Fail to call deposit due to zero amount', async () => {
      await expect(tokenVaultProxy.deposit(ETH, '0')).to.be.revertedWith(
        'AmountIsZero',
      );
    });

    it('Fail to call withdraw due to zero amount', async () => {
      await expect(tokenVaultProxy.withdraw(ETH, '0')).to.be.revertedWith(
        'AmountIsZero',
      );
    });

    it('Fail to call deposit due to no transfer of native token', async () => {
      await expect(tokenVaultProxy.deposit(ETH, '100')).to.be.revertedWith(
        `InvalidAmount("${ETH}", 100, 0)`,
      );
    });

    it('Fail to deposit token due to transfer of native token', async () => {
      await expect(
        tokenVaultProxy.deposit(targetCurrency, '100', { value: 1 }),
      ).to.be.revertedWith(`InvalidAmount("${targetCurrency}", 100, 1)`);
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
        .withArgs(alice.address, targetCurrency, valueInETH, alice.address);
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

      // Verify that the return value matches the full requested amount
      const withdrawnAmount = await tokenVaultProxy
        .connect(alice)
        .callStatic.withdraw(targetCurrency, valueInETH);
      expect(withdrawnAmount).to.equal(valueInETH);

      await expect(
        tokenVaultProxy.connect(alice).withdraw(targetCurrency, valueInETH),
      )
        .to.emit(tokenVaultProxy, 'Withdraw')
        .withArgs(alice.address, targetCurrency, valueInETH);
    });

    it('Withdraw only the withdrawable amount when requesting more than available', async () => {
      const depositAmount = ethers.BigNumber.from('10000');
      // Request more than deposited - should only withdraw what was deposited
      const requestedAmount = ethers.BigNumber.from('20000');
      const depositAmountInETH = ethers.BigNumber.from('10000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(depositAmountInETH);
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256)'
      ].returns(depositAmountInETH);
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256[])'
      ].returns([depositAmountInETH, depositAmountInETH, depositAmountInETH]);

      // Deposit funds
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, depositAmount);

      // Request more than deposited - should only withdraw the deposit amount
      const actualWithdrawnAmount = await tokenVaultProxy
        .connect(bob)
        .callStatic.withdraw(targetCurrency, requestedAmount);

      // Verify that only the deposit amount is returned, not the requested amount
      expect(actualWithdrawnAmount).to.equal(depositAmount);
      expect(actualWithdrawnAmount).to.be.lt(requestedAmount);

      // Execute the actual withdrawal
      await expect(
        tokenVaultProxy.connect(bob).withdraw(targetCurrency, requestedAmount),
      )
        .to.emit(tokenVaultProxy, 'Withdraw')
        .withArgs(bob.address, targetCurrency, depositAmount);

      // Verify that all funds were withdrawn
      const remainingDeposit = await tokenVaultProxy.getDepositAmount(
        bob.address,
        targetCurrency,
      );
      expect(remainingDeposit).to.equal(0);
    });

    it('Fail to call depositFrom due to lending market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultCaller.depositFrom(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('MarketTerminated');
    });

    it('Fail to call depositWithPermitTo due to lending market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultProxy
          .connect(alice)
          .depositWithPermitTo(
            targetCurrency,
            '10000000000000',
            alice.address,
            ethers.constants.MaxUint256,
            1,
            ethers.utils.formatBytes32String('dummy'),
            ethers.utils.formatBytes32String('dummy'),
          ),
      ).to.be.revertedWith('MarketTerminated');
    });

    it('Fail to depositWithPermitFrom due to lending market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultCaller
          .connect(alice)
          .depositWithPermitFrom(
            alice.address,
            targetCurrency,
            '10000000000000',
            ethers.constants.MaxUint256,
            1,
            ethers.utils.formatBytes32String('dummy'),
            ethers.utils.formatBytes32String('dummy'),
          ),
      ).to.be.revertedWith('MarketTerminated');
    });
  });

  describe('Transfer', async () => {
    beforeEach(async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
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

    it('Transfer the deposit amount of Alice, who has a lent amount..', async () => {
      const depositAmount = BigNumber.from('20000000000000');
      const lentAmount = BigNumber.from('1000000000');

      await mockLendingMarketController.mock.calculateFunds.returns({
        workingLendOrdersAmount: 0,
        claimableAmount: 0,
        collateralAmount: 0,
        unallocatedCollateralAmount: 0,
        lentAmount,
        workingBorrowOrdersAmount: 0,
        debtAmount: 0,
        borrowedAmount: 0,
      });

      await tokenVaultProxy
        .connect(alice)
        .deposit(targetCurrency, depositAmount);

      await expect(
        tokenVaultCaller.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          depositAmount,
        ),
      )
        .to.emit(tokenVaultProxy, 'Transfer')
        .withArgs(
          targetCurrency,
          alice.address,
          bob.address,
          depositAmount.sub(lentAmount),
        );

      expect(
        await tokenVaultProxy.getDepositAmount(alice.address, targetCurrency),
      ).to.equal(0);
    });

    it('Fail to transfer deposits due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.transferFrom(
          targetCurrency,
          alice.address,
          bob.address,
          1,
        ),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });
});
