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

const ISwapRouter = artifacts.require('ISwapRouter');

const { deployContract, deployMockContract } = waffle;

describe('TokenVault', () => {
  let mockCurrencyController: MockContract;
  let mockLendingMarketController: MockContract;
  let mockWETH9: MockContract;
  let mockERC20: MockContract;
  let mockUniswapRouter: MockContract;

  let tokenVaultProxy: Contract;
  let tokenVaultCaller: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let signers: SignerWithAddress[];

  let targetCurrency: string;
  let previousCurrency: string;
  let currencyIdx = 0;

  const LIQUIDATION_THRESHOLD_RATE = 12500;

  before(async () => {
    [owner, alice, bob, carol, dave, ...signers] = await ethers.getSigners();

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
    mockUniswapRouter = await deployMockContract(owner, ISwapRouter.abi);

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
    await mockLendingMarketController.mock.calculateFunds.returns(
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
        LIQUIDATION_THRESHOLD_RATE,
        mockUniswapRouter.address,
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
      const setCollateralParameters = async (
        liquidationThresholdRate: number,
        uniswapRouter: string,
      ) => {
        await tokenVaultProxy.setCollateralParameters(
          liquidationThresholdRate,
          uniswapRouter,
        );
        const results = await Promise.all([
          tokenVaultProxy.getLiquidationThresholdRate(),
          tokenVaultProxy.getUniswapRouter(),
        ]);

        expect(results[0]).to.equal(liquidationThresholdRate.toString());
        expect(results[1].toLocaleLowerCase()).to.equal(
          uniswapRouter.toLocaleLowerCase(),
        );
      };

      console.log('mockUniswapRouter:', mockUniswapRouter.address);

      await setCollateralParameters(
        1000,
        ethers.utils.hexlify(ethers.utils.randomBytes(20)),
        // ethers.constants.AddressZero,
      );
      await setCollateralParameters(
        LIQUIDATION_THRESHOLD_RATE,
        mockUniswapRouter.address,
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
      await expect(
        tokenVaultProxy.setCollateralParameters('0', mockUniswapRouter.address),
      ).to.be.revertedWith('Rate is zero');
    });

    it('Fail to call setCollateralParameters due to zero address', async () => {
      await expect(
        tokenVaultProxy.setCollateralParameters(
          LIQUIDATION_THRESHOLD_RATE,
          ethers.constants.AddressZero,
        ),
      ).to.be.revertedWith('Invalid Uniswap Router');
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
        .connect(signers[0])
        .addCollateral(signers[0].address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signers[0].address),
      ).to.equal(value);
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signers[0].address),
      ).to.equal(value);

      await tokenVaultCaller
        .connect(signers[0])
        .removeCollateral(signers[0].address, targetCurrency, value);

      expect(
        await tokenVaultProxy.getUnusedCollateral(signers[0].address),
      ).to.equal('0');
      expect(
        await tokenVaultProxy.getTotalCollateralAmount(signers[0].address),
      ).to.equal('0');
    });

    it('Add and swap the collateral amount', async function () {
      if (!previousCurrency) {
        this.skip();
      }

      const value = ethers.BigNumber.from('30000000000000');

      // Set up for the mocks
      await mockUniswapRouter.mock.exactOutputSingle.returns(value.div(3));

      await tokenVaultCaller
        .connect(signers[1])
        .addCollateral(signers[1].address, targetCurrency, value);

      await tokenVaultCaller
        .connect(signers[1])
        .swapCollateral(
          signers[1].address,
          targetCurrency,
          previousCurrency,
          '1',
          '1',
          '1',
        );

      expect(
        await tokenVaultProxy.getDepositAmount(
          signers[1].address,
          targetCurrency,
        ),
      ).to.equal(value.div(3).mul(2));
      expect(
        await tokenVaultProxy.getDepositAmount(
          signers[1].address,
          previousCurrency,
        ),
      ).to.equal('1');
    });

    it('Get the liquidation amount', async () => {
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
      );

      await tokenVaultProxy.connect(signers[3]).deposit(targetCurrency, value);

      expect(
        await tokenVaultProxy.getWithdrawableCollateral(signers[3].address),
      ).to.equal('0');

      expect(await tokenVaultProxy.getCoverage(signers[3].address)).to.equal(
        '10000',
      );
      expect(
        await tokenVaultProxy.getLiquidationAmount(signers[3].address),
      ).to.equal(debtAmount.div(2));
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
