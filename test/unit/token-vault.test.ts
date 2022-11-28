import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

const AddressResolver = artifacts.require('AddressResolver');
const TokenVault = artifacts.require('TokenVault');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const WETH9 = artifacts.require('MockWETH9');
const MockERC20 = artifacts.require('MockERC20');
const TokenVaultCallerMock = artifacts.require('TokenVaultCallerMock');

const { deployContract, deployMockContract } = waffle;

describe('TokenVault', () => {
  let mockCurrencyController: MockContract;
  let mockLendingMarketController: MockContract;
  let mockWETH9: MockContract;
  let mockERC20: MockContract;

  let tokenVaultProxy: Contract;
  let tokenVaultCaller: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  let targetCurrency: string;
  let previousCurrency: string;
  let currencyIdx = 0;

  const marginCallThresholdRate = 15000;
  const autoLiquidationThresholdRate = 12500;
  const liquidationPriceRate = 12000;
  const minCollateralRate = 2500;

  before(async () => {
    [owner, alice, bob, carol, dave, ellen] = await ethers.getSigners();

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
    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockCurrencyController.mock.isSupportedCcy.returns(true);
    await mockERC20.mock.transferFrom.returns(true);
    await mockERC20.mock.transfer.returns(true);
    await mockLendingMarketController.mock.cleanOrders.returns();
    await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(0);
    await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    );

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const tokenVault = await deployContract(owner, TokenVault);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const tokenVaultAddress = await proxyController
      .setTokenVaultImpl(
        tokenVault.address,
        marginCallThresholdRate,
        autoLiquidationThresholdRate,
        liquidationPriceRate,
        minCollateralRate,
        mockWETH9.address,
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
      const setCollateralParameters = async (...params) => {
        await tokenVaultProxy.setCollateralParameters(...params);
        const results = await tokenVaultProxy.getCollateralParameters();

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

    it('Register a currency', async () => {
      expect(await tokenVaultProxy.isRegisteredCurrency(targetCurrency)).to
        .false;

      await expect(
        tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address),
      ).to.emit(tokenVaultProxy, 'RegisterCurrency');

      expect(await tokenVaultProxy.isRegisteredCurrency(targetCurrency)).true;
    });

    it('Fail to call setCollateralParameters due to invalid ratio', async () => {
      // Check updateMarginCallThresholdRate
      await expect(
        tokenVaultProxy.setCollateralParameters('0', '4', '2', '1'),
      ).to.be.revertedWith('Rate is zero');

      // Check autoLiquidationThresholdRate
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '0', '2', '1'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '4', '2', '1'),
      ).to.be.revertedWith('Auto liquidation threshold rate overflow');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '5', '2', '1'),
      ).to.be.revertedWith('Auto liquidation threshold rate overflow');

      // Check liquidationPriceRate
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '0', '1'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '3', '1'),
      ).to.be.revertedWith('Liquidation price rate overflow');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '4', '1'),
      ).to.be.revertedWith('Liquidation price rate overflow');

      // Check minCollateralRate
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '2', '0'),
      ).to.be.revertedWith('Rate is zero');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '2', '3'),
      ).to.be.revertedWith('Min collateral rate overflow');
      await expect(
        tokenVaultProxy.setCollateralParameters('4', '3', '2', '4'),
      ).to.be.revertedWith('Min collateral rate overflow');
    });
  });

  describe('Deposit & Withdraw', async () => {
    beforeEach(async () => {
      tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address);
    });

    it('Deposit into collateral book', async () => {
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
      // const collateralAmountInETH =
      //   await tokenVaultProxy.getCollateralAmountInETH(
      //     alice.address,
      //     targetCurrency,
      //   );
      expect(collateralAmount).to.equal(value);
      // expect(collateralAmountInETH).to.equal(valueInETH);
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
      );

      const emptyCurrency = ethers.utils.formatBytes32String('');

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('0');
      expect(
        await tokenVaultProxy.isCovered(bob.address, emptyCurrency, 0, 0),
      ).to.equal(true);

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToETH".
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, value);
      await tokenVaultProxy.connect(bob).deposit(previousCurrency, value);

      expect(
        await tokenVaultProxy.isCovered(bob.address, emptyCurrency, 0, 0),
      ).to.equal(true);

      await mockLendingMarketController.mock.calculateTotalFundsInETH.returns(
        0,
        0,
        0,
        0,
        usedValue,
        0,
        0,
      );

      expect(
        await tokenVaultProxy.isCovered(bob.address, emptyCurrency, 0, 0),
      ).to.equal(true);
      expect(
        await tokenVaultProxy.getWithdrawableCollateral(bob.address),
      ).to.equal(
        valueInETH
          .mul('2')
          .mul('10000')
          .sub(valueInETH.div('2').mul(marginCallThresholdRate))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('2500');
      expect(await tokenVaultProxy.getUnusedCollateral(bob.address)).to.equal(
        valueInETH.mul(2).sub(usedValue),
      );

      await expect(
        tokenVaultProxy.connect(bob).withdraw(targetCurrency, '10000000000000'),
      ).to.emit(tokenVaultProxy, 'Withdraw');
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
      );

      await tokenVaultProxy.connect(carol).deposit(targetCurrency, value);

      expect(await tokenVaultProxy.getUnusedCollateral(carol.address)).to.equal(
        valueInETH.add(borrowedAmount),
      );
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(carol.address),
      ).to.equal(value.add(borrowedAmount));
    });

    it('Add the obligation amount', async () => {
      const value = ethers.BigNumber.from('20000000000000');
      const valueInETH = ethers.BigNumber.from('20000000000000');
      const totalPresentValue = ethers.BigNumber.from('20000000000000');
      const obligationAmount = ethers.BigNumber.from('10000000000000');

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
        obligationAmount,
        0,
      );

      await tokenVaultProxy.connect(dave).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(dave.address),
      ).to.equal(
        valueInETH
          .mul('10000')
          .sub(obligationAmount.mul(marginCallThresholdRate))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(dave.address)).to.equal('5000');
      expect(await tokenVaultProxy.getUnusedCollateral(dave.address)).to.equal(
        valueInETH.sub(obligationAmount),
      );
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
      );

      await tokenVaultCaller
        .connect(ellen)
        .addCollateral(ellen.address, targetCurrency, value);

      expect(await tokenVaultProxy.getUnusedCollateral(ellen.address)).to.equal(
        value,
      );
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(ellen.address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(ellen)
        .removeCollateral(ellen.address, targetCurrency, value);

      expect(await tokenVaultProxy.getUnusedCollateral(ellen.address)).to.equal(
        '0',
      );
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(ellen.address),
      ).to.equal('0');
    });

    it('Fail to call addCollateral due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.addCollateral(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
    });

    it('Fail to call removeCollateral due to invalid caller', async () => {
      await expect(
        tokenVaultProxy.removeCollateral(alice.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
    });

    it('Fail to call depositEscrow due to invalid amount', async () => {
      const amount = ethers.BigNumber.from('20000000000000');
      await tokenVaultCaller.addCollateral(
        carol.address,
        targetCurrency,
        amount,
      );

      await expect(
        tokenVaultCaller.removeCollateral(
          carol.address,
          targetCurrency,
          amount.add('1'),
        ),
      ).to.be.revertedWith('Not enough collateral in the selected currency');
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
