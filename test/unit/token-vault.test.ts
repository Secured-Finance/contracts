import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
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
const TokenVaultCallerMock = artifacts.require('TokenVaultCallerMock');

// libraries
const DepositManagementLogic = artifacts.require('DepositManagementLogic');

const ISwapRouter = artifacts.require('ISwapRouter');
const IQuoter = artifacts.require('IQuoter');

const { deployContract, deployMockContract } = waffle;

describe('TokenVault', () => {
  let mockCurrencyController: MockContract;
  let mockLendingMarketController: MockContract;
  let mockReserveFund: MockContract;
  let mockWETH: MockContract;
  let mockERC20: MockContract;
  let mockUniswapRouter: MockContract;
  let mockUniswapQuoter: MockContract;

  let tokenVaultProxy: Contract;
  let tokenVaultCaller: Contract;

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
    mockUniswapRouter = await deployMockContract(owner, ISwapRouter.abi);
    mockUniswapQuoter = await deployMockContract(owner, IQuoter.abi);

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockWETH.mock.transferFrom.returns(true);
    await mockWETH.mock.transfer.returns(true);
    await mockWETH.mock.approve.returns(true);
    await mockWETH.mock.deposit.returns();
    await mockERC20.mock.transferFrom.returns(true);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.approve.returns(true);
    await mockLendingMarketController.mock.cleanOrders.returns(0);
    await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(0);
    await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      true,
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
    const depositManagementLogic = await deployContract(
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
        mockUniswapRouter.address,
        mockUniswapQuoter.address,
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
    tokenVaultCaller = await deployContract(owner, TokenVaultCallerMock, [
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
    it('Update CollateralParameters', async () => {
      const setCollateralParameters = async (
        liquidationThresholdRate: number,
        uniswapRouter: string,
        uniswapQuoter: string,
      ) => {
        await tokenVaultProxy.setCollateralParameters(
          liquidationThresholdRate,
          LIQUIDATION_PROTOCOL_FEE_RATE,
          LIQUIDATOR_FEE_RATE,
          uniswapRouter,
          uniswapQuoter,
        );
        const params = await tokenVaultProxy.getCollateralParameters();

        expect(params.liquidationThresholdRate).to.equal(
          liquidationThresholdRate.toString(),
        );
        expect(params.uniswapRouter.toLocaleLowerCase()).to.equal(
          uniswapRouter.toLocaleLowerCase(),
        );
      };

      await setCollateralParameters(
        1000,
        ethers.utils.hexlify(ethers.utils.randomBytes(20)),
        ethers.utils.hexlify(ethers.utils.randomBytes(20)),
      );
      await setCollateralParameters(
        LIQUIDATION_THRESHOLD_RATE,
        mockUniswapRouter.address,
        mockUniswapQuoter.address,
      );
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

    it('Fail to call setCollateralParameters due to invalid rate', async () => {
      await expect(
        tokenVaultProxy.setCollateralParameters(
          '0',
          '1',
          '1',
          mockUniswapRouter.address,
          mockUniswapQuoter.address,
        ),
      ).to.be.revertedWith('Invalid liquidation threshold rate');
      await expect(
        tokenVaultProxy.setCollateralParameters(
          '1',
          '10001',
          '1',
          mockUniswapRouter.address,
          mockUniswapQuoter.address,
        ),
      ).to.be.revertedWith('Invalid liquidation protocol fee rate');
      await expect(
        tokenVaultProxy.setCollateralParameters(
          '1',
          '1',
          '10001',
          mockUniswapRouter.address,
          mockUniswapQuoter.address,
        ),
      ).to.be.revertedWith('Invalid liquidator fee rate');
    });

    it('Fail to call setCollateralParameters due to zero address', async () => {
      await expect(
        tokenVaultProxy.setCollateralParameters(
          LIQUIDATION_THRESHOLD_RATE,
          LIQUIDATION_PROTOCOL_FEE_RATE,
          LIQUIDATOR_FEE_RATE,
          ethers.constants.AddressZero,
          mockUniswapQuoter.address,
        ),
      ).to.be.revertedWith('Invalid Uniswap Router');
    });
  });

  describe('Deposit & Withdraw', async () => {
    const ETH = ethers.utils.formatBytes32String('ETH');

    before(async () => {
      await tokenVaultProxy.registerCurrency(ETH, mockWETH.address, true);
    });

    beforeEach(async () => {
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
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, value),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value);

      const currencies = await tokenVaultProxy.getUsedCurrencies(alice.address);
      expect(currencies[0]).to.equal(targetCurrency);

      const collateralAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        targetCurrency,
      );
      expect(collateralAmount).to.equal(value);

      const totalCollateralAmount = await tokenVaultProxy.getTotalDepositAmount(
        targetCurrency,
      );
      expect(totalCollateralAmount).to.equal(collateralAmount);
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

      const collateralAmount = await tokenVaultProxy.getDepositAmount(
        alice.address,
        ETH,
      );
      expect(collateralAmount).to.equal(valueInETH);

      const totalCollateralAmount = await tokenVaultProxy.getTotalDepositAmount(
        ETH,
      );
      expect(totalCollateralAmount).to.equal(collateralAmount);
    });

    it('Add the working orders & Withdraw', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const usedValue = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256[])'
      ].returns([valueInETH, valueInETH, valueInETH]);
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );

      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        true,
      );

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('0');
      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToETH".
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, value);
      await tokenVaultProxy.connect(bob).deposit(previousCurrency, value);

      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );

      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        usedValue,
        0,
        0,
        true,
      );

      expect(await tokenVaultProxy['isCovered(address)'](bob.address)).to.equal(
        true,
      );
      expect(
        await tokenVaultProxy.getWithdrawableCollateral(bob.address),
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

      const totalCollateralAmount = await tokenVaultProxy.getTotalDepositAmount(
        targetCurrency,
      );
      expect(totalCollateralAmount).to.equal('10000000000000');
    });

    it('Add the borrowed amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const borrowedAmount = ethers.BigNumber.from('10000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        borrowedAmount,
        true,
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
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
        true,
      );

      await tokenVaultProxy.connect(dave).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(dave.address),
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
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
        false,
      );

      await tokenVaultProxy.connect(ellen).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(ellen.address),
      ).to.equal(
        valueInETH
          .mul('10000')
          .sub(debtAmount.mul(LIQUIDATION_THRESHOLD_RATE))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(ellen.address)).to.equal('5000');
      expect(
        await tokenVaultProxy['isCovered(address,bytes32,uint256,uint8)'](
          ellen.address,
          targetCurrency,
          '1',
          1,
        ),
      ).to.false;
    });

    it('Add and remove the collateral amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        true,
      );

      await tokenVaultCaller
        .connect(signers[0])
        .addDepositAmount(signers[0].address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signers[0].address),
      ).to.equal(value);
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signers[0].address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(signers[0])
        .removeDepositAmount(signers[0].address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signers[0].address),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signers[0].address),
      ).to.equal('0');
    });

    it('Swap the collateral amount and deposit', async function () {
      if (!previousCurrency) {
        this.skip();
      }

      const signer = signers[1];
      const value = ethers.BigNumber.from('30000000000000');
      const swapAmount = ethers.BigNumber.from('7000000000000');

      // Set up for the mocks
      await mockUniswapRouter.mock.exactOutputSingle.returns(value.div(3));
      await mockUniswapQuoter.mock.quoteExactInputSingle.returns(value);
      await mockReserveFund.mock.isPaused.returns(true);

      await tokenVaultCaller.addDepositAmount(
        signer.address,
        targetCurrency,
        value,
      );

      await tokenVaultCaller.swapDepositAmounts(
        owner.address,
        signer.address,
        targetCurrency,
        previousCurrency,
        swapAmount,
        '1',
        '0',
      );

      expect(
        await tokenVaultProxy.getDepositAmount(signer.address, targetCurrency),
      ).to.equal(value.div(3).mul(2));
      expect(
        await tokenVaultProxy.getDepositAmount(
          signer.address,
          previousCurrency,
        ),
      ).to.equal(swapAmount);

      // Check fee amounts
      const { liquidatorFeeRate, liquidationProtocolFeeRate } =
        await tokenVaultProxy.getCollateralParameters();
      const liquidatorFee = await tokenVaultProxy.getDepositAmount(
        owner.address,
        previousCurrency,
      );
      const protocolFee = await tokenVaultProxy.getDepositAmount(
        mockReserveFund.address,
        previousCurrency,
      );
      const amountOutWithFee = swapAmount
        .mul('10000')
        .div(
          ethers.BigNumber.from('10000')
            .sub(liquidatorFeeRate)
            .sub(liquidationProtocolFeeRate),
        );

      expect(swapAmount).to.equal(
        amountOutWithFee.sub(liquidatorFee).sub(protocolFee),
      );
    });

    it('Swap the collateral amount and deposit using the reserve fund', async function () {
      if (!previousCurrency) {
        this.skip();
      }

      const signer = signers[4];
      const value = ethers.BigNumber.from('30000000000000');
      const swapAmount = ethers.BigNumber.from('7000000000000');
      const offsetAmount = ethers.BigNumber.from('1000000');

      // Set up for the mocks
      await mockUniswapRouter.mock.exactOutputSingle.returns(value.mul(2));
      await mockUniswapQuoter.mock.quoteExactInputSingle.returns(value);
      await mockReserveFund.mock.isPaused.returns(false);

      await tokenVaultCaller.addDepositAmount(
        signer.address,
        targetCurrency,
        value,
      );
      await tokenVaultCaller.addDepositAmount(
        mockReserveFund.address,
        targetCurrency,
        value,
      );

      await tokenVaultCaller.swapDepositAmounts(
        owner.address,
        signer.address,
        targetCurrency,
        previousCurrency,
        swapAmount,
        '1',
        offsetAmount,
      );

      expect(
        await tokenVaultProxy.getDepositAmount(signer.address, targetCurrency),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getDepositAmount(
          signer.address,
          previousCurrency,
        ),
      ).to.equal(swapAmount.sub(offsetAmount));

      // Check fee amounts
      const { liquidatorFeeRate, liquidationProtocolFeeRate } =
        await tokenVaultProxy.getCollateralParameters();
      const liquidatorFee = await tokenVaultProxy.getDepositAmount(
        owner.address,
        previousCurrency,
      );
      const protocolFee = await tokenVaultProxy.getDepositAmount(
        mockReserveFund.address,
        previousCurrency,
      );
      const amountOutWithFee = swapAmount
        .mul('10000')
        .div(
          ethers.BigNumber.from('10000')
            .sub(liquidatorFeeRate)
            .sub(liquidationProtocolFeeRate),
        );

      expect(swapAmount).to.equal(
        amountOutWithFee.sub(liquidatorFee).sub(protocolFee),
      );
    });

    it('Add an amount in a currency that is not accepted as collateral', async () => {
      const signer = signers[2];
      const value = '10000000000000';
      const valueInETH = '20000000000000';
      const debtAmount = '5000000000000';

      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
        true,
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
        'convertToETH(bytes32,uint256)'
      ].returns(debtAmount);

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );
      expect(await tokenVaultProxy['isCovered(address)'](signer.address)).to
        .false;
    });

    it('Get the liquidation amount', async () => {
      const signer = signers[3];
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const debtAmount = ethers.BigNumber.from('20000000000000');

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        valueInETH,
      );
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );
      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        0,
        debtAmount,
        0,
        true,
      );

      await tokenVaultProxy.connect(signer).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(signer.address),
      ).to.equal('0');

      expect(await tokenVaultProxy.getCoverage(signer.address)).to.equal(
        '10000',
      );
      expect(
        await tokenVaultProxy.getLiquidationAmount(signer.address),
      ).to.equal(debtAmount.div(2));
    });

    it('Fail to call addDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.addDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
    });

    it('Fail to call removeDepositAmount due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.removeDepositAmount(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
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
      ).to.be.revertedWith('Not enough collateral in the selected currency');
    });

    it('Fail to call deposit due to invalid amount', async () => {
      await expect(tokenVaultProxy.deposit(ETH, '100')).to.be.revertedWith(
        'Invalid amount',
      );
    });

    it('Deposit funds from Alice', async () => {
      const valueInETH = '10000';

      // Set up for the mocks
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);

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
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);
      await mockCurrencyController.mock.convertFromETH.returns(valueInETH);

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
});
