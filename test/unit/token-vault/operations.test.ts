import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
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

describe('TokenVault - Operations', () => {
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

  let targetCurrency: string;
  let currencyIdx = 0;

  before(async () => {
    [owner, alice, bob] = await ethers.getSigners();

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
    await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
      {
        plusDepositAmountInAdditionalFundsCcy: 0,
        minusDepositAmountInAdditionalFundsCcy: 0,
        workingLendOrdersAmount: 0,
        claimableAmount: 0,
        collateralAmount: 0,
        lentAmount: 0,
        workingBorrowOrdersAmount: 0,
        debtAmount: 0,
        borrowedAmount: 0,
      },
    );
    await mockLendingMarketController.mock.isRedemptionRequired.returns(false);

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

  describe('Initialize', async () => {
    it('Get liquidation threshold rate', async () => {
      const liquidationThresholdRate =
        await tokenVaultProxy.getLiquidationThresholdRate();

      expect(liquidationThresholdRate).to.equal(LIQUIDATION_THRESHOLD_RATE);
    });

    it('Update the liquidation configuration', async () => {
      const updateLiquidationConfiguration = async (
        liquidationThresholdRate: number,
      ) => {
        await tokenVaultProxy.updateLiquidationConfiguration(
          liquidationThresholdRate,
          liquidationThresholdRate,
          LIQUIDATION_PROTOCOL_FEE_RATE,
          LIQUIDATOR_FEE_RATE,
        );
        const params = await tokenVaultProxy.getLiquidationConfiguration();

        expect(params.liquidationThresholdRate).to.equal(
          liquidationThresholdRate.toString(),
        );
      };

      await updateLiquidationConfiguration(PCT_DIGIT + 1);
      await updateLiquidationConfiguration(LIQUIDATION_THRESHOLD_RATE);
    });

    it('Fail to call updateLiquidationConfiguration due to invalid rate', async () => {
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration(
          PCT_DIGIT,
          PCT_DIGIT + 1,
          PCT_DIGIT,
          PCT_DIGIT,
        ),
      ).to.be.revertedWith('InvalidLiquidationThresholdRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration(
          PCT_DIGIT + 1,
          PCT_DIGIT,
          PCT_DIGIT,
          PCT_DIGIT,
        ),
      ).to.be.revertedWith('InvalidFullLiquidationThresholdRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration(
          PCT_DIGIT + 1,
          PCT_DIGIT + 2,
          PCT_DIGIT,
          PCT_DIGIT,
        ),
      ).to.be.revertedWith('InvalidFullLiquidationThresholdRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration(
          PCT_DIGIT + 1,
          PCT_DIGIT + 1,
          PCT_DIGIT + 1,
          PCT_DIGIT,
        ),
      ).to.be.revertedWith('InvalidLiquidationProtocolFeeRate');
      await expect(
        tokenVaultProxy.updateLiquidationConfiguration(
          PCT_DIGIT + 1,
          PCT_DIGIT + 1,
          PCT_DIGIT,
          PCT_DIGIT + 1,
        ),
      ).to.be.revertedWith('InvalidLiquidatorFeeRate');
    });

    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        tokenVaultProxy.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          1,
          1,
          1,
          1,
          ethers.constants.AddressZero,
        ),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const tokenVault = await ethers
        .getContractFactory('TokenVault', {
          libraries: {
            DepositManagementLogic: depositManagementLogic.address,
          },
        })
        .then((factory) => factory.deploy());

      await expect(
        tokenVault.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          1,
          1,
          1,
          1,
          ethers.constants.AddressZero,
        ),
      ).revertedWith('Must be called from proxy contract');
    });
  });

  describe('Currencies', async () => {
    it('Register currency', async () => {
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
      expect(await tokenVaultProxy.getTokenAddress(targetCurrency)).to.equal(
        mockERC20.address,
      );
      expect(await tokenVaultProxy['isCollateral(bytes32)'](targetCurrency))
        .true;

      const isCollaterals = await tokenVaultProxy['isCollateral(bytes32[])']([
        targetCurrency,
      ]);
      expect(isCollaterals.length).to.equal(1);
      expect(isCollaterals[0]).to.true;

      const collateralCurrencies =
        await tokenVaultProxy.getCollateralCurrencies();
      expect(collateralCurrencies.length).to.equal(1);
      expect(collateralCurrencies[0]).to.equal(targetCurrency);
    });

    it('Update collateral currency to non-collateral currency', async () => {
      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          mockERC20.address,
          true,
        ),
      ).emit(tokenVaultProxy, 'CurrencyRegistered');

      await expect(tokenVaultProxy.updateCurrency(targetCurrency, false)).emit(
        tokenVaultProxy,
        'CurrencyUpdated',
      );
    });

    it('Register non-collateral currency to collateral currency', async () => {
      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          mockERC20.address,
          false,
        ),
      ).emit(tokenVaultProxy, 'CurrencyRegistered');

      await expect(tokenVaultProxy.updateCurrency(targetCurrency, true)).emit(
        tokenVaultProxy,
        'CurrencyUpdated',
      );
    });

    it('Fail to receive ETH due to execution by non-WETH contract', async () => {
      const tx = {
        to: tokenVaultProxy.address,
        value: 1,
      };

      await expect(owner.sendTransaction(tx)).to.be.revertedWith(
        'CallerNotBaseCurrency',
      );
    });

    it('Fail to register currency due to execution by non-owner', async () => {
      await expect(
        tokenVaultProxy
          .connect(alice)
          .registerCurrency(targetCurrency, mockERC20.address, true),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to update currency due to execution by non-owner', async () => {
      await expect(
        tokenVaultProxy.connect(alice).updateCurrency(targetCurrency, true),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to register currency due to nonexistent currency', async () => {
      await mockCurrencyController.mock.currencyExists.returns(false);

      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          mockERC20.address,
          true,
        ),
      ).revertedWith('InvalidCurrency');
    });

    it('Fail to register currency due to duplicate registration', async () => {
      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );

      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          ethers.constants.AddressZero,
          true,
        ),
      ).revertedWith('InvalidCurrency');
    });

    it('Fail to register currency due to zero address', async () => {
      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          ethers.constants.AddressZero,
          true,
        ),
      ).revertedWith('InvalidToken');
    });

    it('Fail to register currency due to market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultProxy.registerCurrency(
          targetCurrency,
          ethers.constants.AddressZero,
          true,
        ),
      ).revertedWith('MarketTerminated');
    });

    it('Fail to update currency due to market termination', async () => {
      await mockLendingMarketController.mock.isTerminated.returns(true);

      await expect(
        tokenVaultProxy.updateCurrency(targetCurrency, true),
      ).revertedWith('MarketTerminated');
    });
  });

  describe('Pause/Unpause', async () => {
    const arbitraryAmount = '1000';

    beforeEach(async () => {
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns(1);

      await tokenVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
        true,
      );
    });

    it('Pause token vault', async () => {
      await tokenVaultProxy.pause();

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, arbitraryAmount),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultProxy
          .connect(alice)
          .withdraw(targetCurrency, arbitraryAmount),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultCaller.depositFrom(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        tokenVaultProxy
          .connect(alice)
          .depositWithPermitTo(
            targetCurrency,
            arbitraryAmount,
            alice.address,
            ethers.constants.MaxUint256,
            1,
            ethers.utils.formatBytes32String('dummy'),
            ethers.utils.formatBytes32String('dummy'),
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
      await tokenVaultProxy.unpause();

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, arbitraryAmount),
      ).to.be.not.reverted;

      await tokenVaultProxy
        .connect(alice)
        .withdraw(targetCurrency, arbitraryAmount);

      await expect(
        tokenVaultCaller.depositFrom(
          alice.address,
          targetCurrency,
          arbitraryAmount,
        ),
      ).to.be.not.reverted;

      await expect(
        tokenVaultProxy
          .connect(alice)
          .depositWithPermitTo(
            targetCurrency,
            arbitraryAmount,
            alice.address,
            ethers.constants.MaxUint256,
            1,
            ethers.utils.formatBytes32String('dummy'),
            ethers.utils.formatBytes32String('dummy'),
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

    it('Change the operator', async () => {
      await expect(tokenVaultProxy.connect(alice).pause()).to.be.revertedWith(
        'CallerNotOperator',
      );
      await expect(tokenVaultProxy.connect(alice).unpause()).to.be.revertedWith(
        'CallerNotOperator',
      );

      await tokenVaultProxy.addOperator(alice.address);

      await expect(tokenVaultProxy.connect(alice).pause()).to.be.not.reverted;
      await expect(tokenVaultProxy.connect(alice).unpause()).to.be.not.reverted;

      await tokenVaultProxy.removeOperator(alice.address);

      await expect(tokenVaultProxy.connect(alice).pause()).to.be.revertedWith(
        'CallerNotOperator',
      );
      await expect(tokenVaultProxy.connect(alice).unpause()).to.be.revertedWith(
        'CallerNotOperator',
      );
    });
  });
});
