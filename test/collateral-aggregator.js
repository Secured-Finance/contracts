const AddressResolver = artifacts.require('AddressResolver');
const CollateralAggregator = artifacts.require('CollateralAggregatorV3');
const CollateralVault = artifacts.require('CollateralVaultV2');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarketController = artifacts.require('LendingMarketControllerV2');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyControllerV2');
const WETH9 = artifacts.require('WETH9Mock');
const ERC20Mock = artifacts.require('ERC20Mock');

const { expect } = require('chai');
const { ethers, waffle } = require('hardhat');
const { deployContract, deployMockContract } = waffle;

contract('CollateralAggregator', () => {
  let mockCurrencyController;
  let mockLendingMarketController;
  let mockWETH9;
  let mockERC20;

  let collateralAggregatorProxy;
  let collateralVaultProxy;

  let owner, alice, bob, carol;

  const marginCallThresholdRate = 15000;
  const autoLiquidationThresholdRate = 12500;
  const liquidationPriceRate = 12000;
  const minCollateralRate = 2500;

  before(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockLendingMarketController = await deployMockContract(
      owner,
      LendingMarketController.abi,
    );
    mockWETH9 = await deployMockContract(owner, WETH9.abi);
    mockERC20 = await deployMockContract(owner, ERC20Mock.abi);
    await mockLendingMarketController.mock.getLendingMarkets.returns([
      owner.address,
    ]);

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const collateralAggregator = await deployContract(
      owner,
      CollateralAggregator,
    );
    const collateralVault = await deployContract(owner, CollateralVault);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const collateralVaultAddress = await proxyController
      .setCollateralVaultImpl(collateralVault.address, mockWETH9.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );
    const collateralAggregatorAddress = await proxyController
      .setCollateralAggregatorImpl(
        collateralAggregator.address,
        marginCallThresholdRate,
        autoLiquidationThresholdRate,
        liquidationPriceRate,
        minCollateralRate,
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
    collateralAggregatorProxy = await ethers.getContractAt(
      'CollateralAggregatorV3',
      collateralAggregatorAddress,
    );
    collateralVaultProxy = await ethers.getContractAt(
      'CollateralVaultV2',
      collateralVaultAddress,
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets = [
      ['CurrencyController', mockCurrencyController],
      ['CollateralAggregator', collateralAggregatorProxy],
      ['CollateralVault', collateralVaultProxy],
      ['LendingMarketController', mockLendingMarketController],
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
      collateralAggregatorProxy.address,
      collateralVaultProxy.address,
    ]);

    // Set up for CollateralAggregator
    await collateralAggregatorProxy.connect(alice)['register()']();
  });

  describe('Initialize', async () => {
    it('Success to register', async () => {
      await expect(
        collateralAggregatorProxy.connect(bob)['register()'](),
      ).to.emit(collateralAggregatorProxy, 'Register');
    });

    it('Fail to register due to duplication', async () => {
      await expect(
        collateralAggregatorProxy.connect(alice)['register()'](),
      ).to.be.revertedWith('User exists');
    });

    it('Update CollateralParameters', async () => {
      const setCollateralParameters = async (...params) => {
        await collateralAggregatorProxy.setCollateralParameters(...params);
        const results =
          await collateralAggregatorProxy.getCollateralParameters();

        expect(results.length).to.equal(4);
        expect(results[0]).to.equal(params[0]);
        expect(results[1]).to.equal(params[1]);
        expect(results[2]).to.equal(params[2]);
        expect(results[3]).to.equal(params[3]);
      };

      await setCollateralParameters('4', '3', '2', '1');
      await setCollateralParameters(
        marginCallThresholdRate,
        autoLiquidationThresholdRate,
        liquidationPriceRate,
        minCollateralRate,
      );
    });

    it('Fail to call setCollateralParameters due to invalid ratio', async () => {
      // Check updateMarginCallThresholdRate
      await expect(
        collateralAggregatorProxy.setCollateralParameters('0', '4', '2', '1'),
      ).to.be.revertedWith('Rate is zero');

      // Check autoLiquidationThresholdRate
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '0', '2', '1'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '4', '2', '1'),
      ).to.be.revertedWith('Auto liquidation threshold rate overflow');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '5', '2', '1'),
      ).to.be.revertedWith('Auto liquidation threshold rate overflow');

      // Check liquidationPriceRate
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '0', '1'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '3', '1'),
      ).to.be.revertedWith('Liquidation price rate overflow');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '4', '1'),
      ).to.be.revertedWith('Liquidation price rate overflow');

      // Check minCollateralRate
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '2', '0'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '2', '3'),
      ).to.be.revertedWith('Min collateral rate overflow');
      await expect(
        collateralAggregatorProxy.setCollateralParameters('4', '3', '2', '4'),
      ).to.be.revertedWith('Min collateral rate overflow');
    });
  });

  describe('Deposit & Withdraw', async () => {
    let targetCurrency;
    let previousCurrency;
    let currencyIdx = 0;

    before(async () => {
      await mockCurrencyController.mock.isCollateral.returns(true);
      await mockERC20.mock.transferFrom.returns(true);
      await mockERC20.mock.transfer.returns(true);
    });

    beforeEach(async () => {
      previousCurrency = targetCurrency;
      targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
      currencyIdx++;
    });

    it('Register a currency', async () => {
      await expect(
        collateralVaultProxy.registerCurrency(
          targetCurrency,
          mockERC20.address,
        ),
      ).to.emit(collateralVaultProxy, 'CurrencyRegistered');
    });

    it('Deposit into collateral book', async () => {
      const value = '10000000000000';
      const valueInETH = '20000000000000';

      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);

      await collateralVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
      );

      await expect(
        collateralVaultProxy.connect(alice).deposit(targetCurrency, value),
      ).to.emit(collateralVaultProxy, 'Deposit', { value });

      expect(await collateralVaultProxy.getUsedCurrencies(alice.address), [
        targetCurrency,
      ]);

      const independentCollateral =
        await collateralVaultProxy.getIndependentCollateral(
          alice.address,
          targetCurrency,
        );
      const independentCollateralInETH =
        await collateralVaultProxy.getIndependentCollateralInETH(
          alice.address,
          targetCurrency,
        );
      expect(independentCollateral).to.equal(value);
      expect(independentCollateralInETH).to.equal(valueInETH);
    });

    it('Lock the unsettled collateral & Withdraw', async () => {
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
      await mockLendingMarketController.mock.getTotalPresentValue.returns(
        totalPresentValue,
      );

      await collateralVaultProxy.registerCurrency(
        targetCurrency,
        mockERC20.address,
      );

      expect(
        await collateralAggregatorProxy.isCoveredUnsettled(
          bob.address,
          targetCurrency,
          0,
        ),
      ).to.equal(false);

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToETH".
      await collateralVaultProxy.connect(bob).deposit(targetCurrency, value);
      await collateralVaultProxy.connect(bob).deposit(previousCurrency, value);

      await expect(
        collateralAggregatorProxy.useUnsettledCollateral(
          bob.address,
          targetCurrency,
          value.div('2'),
        ),
      ).to.emit(collateralAggregatorProxy, 'UseUnsettledCollateral');

      expect(
        await collateralAggregatorProxy.isCoveredUnsettled(
          bob.address,
          targetCurrency,
          0,
        ),
      ).to.equal(true);

      expect(
        await collateralAggregatorProxy.getMaxCollateralBookWithdraw(
          bob.address,
        ),
      ).to.equal(
        valueInETH
          .mul('2')
          .mul('10000')
          .sub(valueInETH.mul(marginCallThresholdRate))
          .div('10000'),
      );

      expect(
        await collateralAggregatorProxy.getUnsettledCoverage(bob.address),
      ).to.equal('20000');

      expect(
        await collateralAggregatorProxy.getUnsettledCollateral(
          bob.address,
          targetCurrency,
        ),
      ).to.equal(value.div('2').toString());

      expect(
        await collateralAggregatorProxy.getTotalUnsettledExp(bob.address),
      ).to.equal(valueInETH);

      await expect(
        collateralVaultProxy
          .connect(bob)
          .withdraw(targetCurrency, '10000000000000'),
      ).to.emit(collateralVaultProxy, 'Withdraw');
    });

    it('Fail to lock the unsettled collateral due to no enough collateral', async () => {
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns('0');
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        '0',
      );

      expect(
        await collateralAggregatorProxy.getMaxCollateralBookWithdraw(
          carol.address,
        ),
      ).to.equal('0');
      expect(
        await collateralAggregatorProxy.getUnsettledCoverage(carol.address),
      ).to.equal('0');

      await expect(
        collateralAggregatorProxy.useUnsettledCollateral(
          carol.address,
          targetCurrency,
          '1',
        ),
      ).to.be.revertedWith('Not enough collateral');

      await expect(
        collateralAggregatorProxy.useUnsettledCollateral(
          carol.address,
          targetCurrency,
          '0',
        ),
      ).to.be.revertedWith('Not enough collateral');
    });

    it('Fail to call deposit due to unregistered user', async () => {
      await expect(
        collateralVaultProxy.connect(owner).deposit(targetCurrency, '1'),
      ).to.be.revertedWith('User not registered');
    });

    it('Fail to call withdraw due to unregistered user', async () => {
      await expect(
        collateralVaultProxy.connect(owner).withdraw(targetCurrency, '1'),
      ).to.be.revertedWith('User not registered');
    });

    it('Fail to call useUnsettledCollateral due to invalid caller', async () => {
      await expect(
        collateralAggregatorProxy
          .connect(alice)
          .useUnsettledCollateral(carol.address, targetCurrency, '1'),
      ).to.be.revertedWith('Caller is not the lending market');
    });

    it('Fail to call releaseUnsettledCollateral due to invalid caller', async () => {
      await expect(
        collateralAggregatorProxy
          .connect(alice)
          .releaseUnsettledCollateral(carol.address, targetCurrency, '1'),
      ).to.be.revertedWith('Caller is not the lending market');
    });
  });
});
