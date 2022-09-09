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
const WETH9 = artifacts.require('WETH9Mock');
const ERC20Mock = artifacts.require('ERC20Mock');
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

  let targetCurrency: string;
  let previousCurrency: string;
  let currencyIdx = 0;

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
    before(async () => {
      await mockCurrencyController.mock.isSupportedCcy.returns(true);
      await mockERC20.mock.transferFrom.returns(true);
      await mockERC20.mock.transfer.returns(true);
    });

    it('Register a currency', async () => {
      await expect(
        tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address),
      ).to.emit(tokenVaultProxy, 'CurrencyRegistered');
    });

    it('Deposit into collateral book', async () => {
      const value = '10000000000000';
      const valueInETH = '20000000000000';

      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(valueInETH);

      await tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address);

      await expect(
        tokenVaultProxy.connect(alice).deposit(targetCurrency, value),
      )
        .to.emit(tokenVaultProxy, 'Deposit')
        .withArgs(alice.address, targetCurrency, value);

      const currencies = await tokenVaultProxy.getUsedCurrencies(alice.address);
      expect(currencies[0]).to.equal(targetCurrency);

      const collateralAmount = await tokenVaultProxy.getCollateralAmount(
        alice.address,
        targetCurrency,
      );
      const collateralAmountInETH =
        await tokenVaultProxy.getCollateralAmountInETH(
          alice.address,
          targetCurrency,
        );
      expect(collateralAmount).to.equal(value);
      expect(collateralAmountInETH).to.equal(valueInETH);
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
      await mockLendingMarketController.mock.getTotalPresentValueInETH.returns(
        totalPresentValue,
      );

      await tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address);

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('0');
      expect(await tokenVaultProxy.isCovered(bob.address)).to.equal(true);

      // NOTE: Deposit in two currencies to double the collateral
      // since the mock always returns the same value with "convertToETH".
      await tokenVaultProxy.connect(bob).deposit(targetCurrency, value);
      await tokenVaultProxy.connect(bob).deposit(previousCurrency, value);

      expect(await tokenVaultProxy.isCovered(bob.address)).to.equal(true);

      await expect(
        tokenVaultCaller.useUnsettledCollateral(
          bob.address,
          targetCurrency,
          value.div('2'),
        ),
      ).to.emit(tokenVaultProxy, 'UseUnsettledCollateral');

      expect(await tokenVaultProxy.isCovered(bob.address)).to.equal(true);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(bob.address),
      ).to.equal(
        valueInETH
          .mul('2')
          .mul('10000')
          .sub(valueInETH.mul(marginCallThresholdRate))
          .div('10000'),
      );

      expect(await tokenVaultProxy.getCoverage(bob.address)).to.equal('5000');

      expect(
        await tokenVaultProxy.getUnsettledCollateral(
          bob.address,
          targetCurrency,
        ),
      ).to.equal(value.div('2').toString());

      expect(
        await tokenVaultProxy.getTotalUnsettledExposure(bob.address),
      ).to.equal(valueInETH);

      await expect(
        tokenVaultProxy.connect(bob).withdraw(targetCurrency, '10000000000000'),
      ).to.emit(tokenVaultProxy, 'Withdraw');
    });

    it('Fail to lock the unsettled collateral due to no enough collateral', async () => {
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns('10000000000000');
      await mockCurrencyController.mock['convertToETH(bytes32,int256)'].returns(
        '0',
      );

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(carol.address),
      ).to.equal('0');
      expect(await tokenVaultProxy.getCoverage(carol.address)).to.equal('0');

      await expect(
        tokenVaultCaller.useUnsettledCollateral(
          carol.address,
          targetCurrency,
          '1',
        ),
      ).to.be.revertedWith('Not enough collateral');
    });

    it('Fail to call useUnsettledCollateral due to invalid caller', async () => {
      await expect(
        tokenVaultProxy
          .connect(alice)
          .useUnsettledCollateral(carol.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
    });

    it('Fail to call releaseUnsettledCollateral due to invalid caller', async () => {
      await expect(
        tokenVaultProxy
          .connect(alice)
          .releaseUnsettledCollateral(carol.address, targetCurrency, '1'),
      ).to.be.revertedWith('Only Accepted Contracts');
    });
  });

  describe('Escrow', async () => {
    it('Deposit funds to the escrow', async () => {
      await tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address);

      await expect(
        tokenVaultCaller.addEscrowedAmount(
          owner.address,
          targetCurrency,
          '10000',
        ),
      ).to.emit(tokenVaultProxy, 'EscrowedAmountAdded');
    });

    it('Withdraw funds From the escrow', async () => {
      await tokenVaultProxy.registerCurrency(targetCurrency, mockERC20.address);

      await tokenVaultCaller.addEscrowedAmount(
        owner.address,
        targetCurrency,
        '10000',
      );

      await expect(
        tokenVaultCaller.removeEscrowedAmount(
          owner.address,
          owner.address,
          targetCurrency,
          '10000',
        ),
      ).to.emit(tokenVaultProxy, 'EscrowedAmountRemoved');
    });

    it('Fail to call addEscrowedAmount due to invalid amount', async () => {
      await expect(
        tokenVaultCaller.addEscrowedAmount(owner.address, targetCurrency, '0'),
      ).to.be.revertedWith('Invalid amount');
    });

    it('Fail to call removeEscrowedAmount due to invalid amount', async () => {
      await expect(
        tokenVaultCaller.removeEscrowedAmount(
          owner.address,
          owner.address,
          targetCurrency,
          '0',
        ),
      ).to.be.revertedWith('Invalid amount');
    });

    it('Fail to call removeEscrowedAmount due to not enough amount', async () => {
      await expect(
        tokenVaultCaller.removeEscrowedAmount(
          owner.address,
          owner.address,
          targetCurrency,
          '10000',
        ),
      ).to.be.revertedWith('Not enough escrowed amount');
    });
  });
});
