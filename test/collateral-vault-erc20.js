const AddressResolver = artifacts.require('AddressResolver');
const CollateralAggregatorMock = artifacts.require('CollateralAggregatorMock');
const CrosschainAddressResolver = artifacts.require(
  'CrosschainAddressResolver',
);
const CurrencyController = artifacts.require('CurrencyController');
const ERC20Mock = artifacts.require('ERC20Mock');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');
const ProductAddressResolver = artifacts.require('ProductAddressResolver');
const WETH9Mock = artifacts.require('WETH9Mock');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');

const { toBytes32, hexFILString, zeroAddress, overflowErrorMsg } =
  require('../test-utils').strings;
const { ZERO_BN, decimalBase, toBN } = require('../test-utils').numbers;
const { checkTokenBalances } = require('../test-utils').balances;

const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const utils = require('web3-utils');

should();

contract('ERC20 based CollateralVault', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let collateralAggregatorProxy;
  let vault;
  let tokenContract;

  let filToETHRate = toBN('67175250000000000');
  let filToETHPriceFeed;

  let aliceTokenBalance;
  let aliceLockedTokens;
  let aliceMaxWithdraw;

  let bobTokenBalance;

  let aliceLockedInPositionWithCarol;

  let currencyControllerProxy;

  before(
    'deploy CollateralVault, CollateralAggregator, CurrencyController, price feeds and ERC20 mock contracts',
    async () => {
      aliceTokenBalance = decimalBase.mul(toBN('1000'));

      // Deploy contracts
      const DealId = await ethers.getContractFactory('DealId');
      const dealIdLibrary = await DealId.deploy();
      await dealIdLibrary.deployed();
      const addressResolver = await AddressResolver.new();
      const currencyController = await CurrencyController.new();
      const crosschainAddressResolver = await CrosschainAddressResolver.new();
      const proxyController = await ProxyController.new(
        addressResolver.address,
      );
      const migrationAddressResolver = await MigrationAddressResolver.new(
        addressResolver.address,
      );
      tokenContract = await ERC20Mock.new(
        toBytes32('Test FIL'),
        toBytes32('tFIL'),
        alice,
        aliceTokenBalance,
      );
      collateralAggregatorMock = await CollateralAggregatorMock.new();
      wETHToken = await WETH9Mock.new();
      filToETHPriceFeed = await MockV3Aggregator.new(
        18,
        hexFILString,
        filToETHRate,
      );
      const productAddressResolver = await ethers
        .getContractFactory('ProductAddressResolver', {
          libraries: {
            DealId: dealIdLibrary.address,
          },
        })
        .then((factory) => factory.deploy());

      // Set contract addresses to the Proxy contract
      const [
        collateralAggregatorAddress,
        currencyControllerAddress,
        crosschainAddressResolverAddress,
        productAddressResolverAddress,
      ] = await Promise.all([
        proxyController.setCollateralAggregatorImpl(
          collateralAggregatorMock.address,
        ),
        proxyController.setCurrencyControllerImpl(currencyController.address),
        proxyController.setCrosschainAddressResolverImpl(
          crosschainAddressResolver.address,
        ),
        proxyController.setProductAddressResolverImpl(
          productAddressResolver.address,
        ),
      ]).then((txs) =>
        txs.map(
          ({ logs }) =>
            logs.find(({ event }) => event === 'ProxyCreated').args
              .proxyAddress,
        ),
      );

      // Get the Proxy contract addresses
      collateralAggregatorProxy = await CollateralAggregatorMock.at(
        collateralAggregatorAddress,
      );
      currencyControllerProxy = await CurrencyController.at(
        currencyControllerAddress,
      );
      const crosschainAddressResolverProxy = await CrosschainAddressResolver.at(
        crosschainAddressResolverAddress,
      );
      const productAddressResolverProxy = await ProductAddressResolver.at(
        productAddressResolverAddress,
      );

      // Set up for AddressResolver and build caches using MigrationAddressResolver
      await addressResolver.importAddresses(
        [
          'CollateralAggregator',
          'CrosschainAddressResolver',
          'CurrencyController',
          'Liquidations',
          'Loan',
          'ProductAddressResolver',
        ].map((input) => toBytes32(input)),
        [
          collateralAggregatorProxy.address,
          crosschainAddressResolverProxy.address,
          currencyControllerProxy.address,
          utils.randomHex(20),
          utils.randomHex(20),
          productAddressResolverProxy.address,
        ],
      );

      await migrationAddressResolver.buildCaches([
        collateralAggregatorProxy.address,
        crosschainAddressResolverProxy.address,
      ]);

      // Set up for CurrencyController
      await currencyControllerProxy.supportCurrency(
        hexFILString,
        'Filecoin',
        461,
        filToETHPriceFeed.address,
        7500,
        zeroAddress,
      );
      await currencyControllerProxy.updateCollateralSupport(hexFILString, true);

      vault = await ethers
        .getContractFactory('CollateralVault')
        .then((factory) =>
          factory.deploy(
            addressResolver.address,
            hexFILString,
            tokenContract.address,
            wETHToken.address,
          ),
        );
      await collateralAggregatorProxy.linkCollateralVault(vault.address, {
        from: owner,
      });
    },
  );

  describe('Test token deposits into collateral vault', () => {
    let bobDepositAmt = decimalBase.mul(toBN('10')); // 10 tFIL tokens

    it('Deposit all tFIL tokens into the vault by Alice, validate token balances', async () => {
      const [ownerSigner, aliceSigner] = await ethers.getSigners();
      await collateralAggregatorProxy.register({ from: alice });

      await tokenContract.approveInternal(
        alice,
        vault.address,
        aliceTokenBalance,
      );
      await vault
        .connect(aliceSigner)
        ['deposit(uint256)'](aliceTokenBalance.toString());

      aliceLockedTokens = aliceTokenBalance;
      aliceTokenBalance = ZERO_BN;

      await checkTokenBalances(
        [alice, vault.address],
        [aliceTokenBalance, aliceLockedTokens],
        tokenContract,
      );

      let independentCollateral = await vault.getIndependentCollateral(alice);
      independentCollateral
        .toString()
        .should.be.equal(aliceLockedTokens.toString());

      aliceMaxWithdraw = await currencyControllerProxy.convertToETH(
        hexFILString,
        aliceLockedTokens,
      );
      await collateralAggregatorProxy.setMaxCollateralBookWidthdraw(
        alice,
        aliceMaxWithdraw,
      );
      aliceMaxWithdraw
        .toString()
        .should.be.equal(
          (
            await collateralAggregatorProxy.getMaxCollateralBookWidthdraw(alice)
          ).toString(),
        );

      let vaults = await collateralAggregatorProxy.getUsedVaults(alice);
      vaults.includes(vault.address).should.be.equal(true);
    });

    it('Try to deposit some tokens by Bob, expect revert on zero balance transfer', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      await collateralAggregatorProxy.register({ from: bob });

      await expectRevert(
        vault.connect(bobSigner)['deposit(uint256)'](bobDepositAmt.toString()),
        'TransferHelper: TRANSFER_FROM_FAILED',
      );
    });

    it('Try to deposit some tokens by Bob, expect revert on non-approved transfer', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      await tokenContract.mint(bob, bobDepositAmt);
      bobDepositAmt
        .toString()
        .should.be.equal((await tokenContract.balanceOf(bob)).toString());
      bobTokenBalance = bobDepositAmt;

      await expectRevert(
        // expect revert on deposit without approve on token transfer
        vault.connect(bobSigner)['deposit(uint256)'](bobDepositAmt.toString()),
        'TransferHelper: TRANSFER_FROM_FAILED',
      );
    });
  });

  describe('Test collateral vault rebalancing functionality', () => {
    it('Rebalance all independent collateral from Alice into the position with Bob', async () => {
      let rebalanceAmt = aliceMaxWithdraw;
      let rebalanceAmtTokens = aliceLockedTokens;

      await collateralAggregatorProxy.rebalanceTo(
        alice,
        bob,
        rebalanceAmt,
        vault.address,
      );
      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollateral[0]
        .toString()
        .should.be.equal(rebalanceAmtTokens.toString());
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address)'](alice);
      lockedCollateral
        .toString()
        .should.be.equal(rebalanceAmtTokens.toString());

      let vaults = await collateralAggregatorProxy.methods[
        'getUsedVaults(address,address)'
      ](alice, bob);
      vaults.includes(vault.address).should.be.equal(true);
    });

    it('Rebalance more collateral than deposited by Alice and Bob, expect no state changes', async () => {
      let rebalanceAmtAlice = aliceMaxWithdraw.div(toBN(10));
      let rebalanceAmtBob = decimalBase.mul(toBN('10'));
      rebalanceAmtBob = await currencyControllerProxy.convertToETH(
        hexFILString,
        rebalanceAmtBob,
      );

      await collateralAggregatorProxy.rebalanceTo(
        alice,
        bob,
        rebalanceAmtAlice,
        vault.address,
      );
      await collateralAggregatorProxy.rebalanceTo(
        bob,
        alice,
        rebalanceAmtBob,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollateral[0]
        .toString()
        .should.be.equal(aliceLockedTokens.toString());
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address)'](alice);
      lockedCollateral.toString().should.be.equal(aliceLockedTokens.toString());

      lockedCollateral = await vault['getLockedCollateral(address)'](bob);
      lockedCollateral.toString().should.be.equal('0');
    });

    it("Rebalance from Bob's position with Alice, expect no state changes as Bob deposited 0 tokens into position", async () => {
      let rebalanceAmtBob = decimalBase.mul(toBN('10'));
      rebalanceAmtBob = await currencyControllerProxy.convertToETH(
        hexFILString,
        rebalanceAmtBob,
      );

      await collateralAggregatorProxy.rebalanceFrom(
        bob,
        alice,
        rebalanceAmtBob,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](bob, alice);
      lockedCollateral[0].toString().should.be.equal('0');
      lockedCollateral[1]
        .toString()
        .should.be.equal(aliceLockedTokens.toString());

      lockedCollateral = await vault['getLockedCollateral(address)'](bob);
      lockedCollateral.toString().should.be.equal('0');
      let independentCollateral = await vault.getIndependentCollateral(bob);
      independentCollateral.toString().should.be.equal('0');
    });

    it("Rebalance between Bob's position with Alice to Carol, expect no state changes", async () => {
      let rebalanceAmtBob = decimalBase.mul(toBN('10'));
      rebalanceAmtBob = await currencyControllerProxy.convertToETH(
        hexFILString,
        rebalanceAmtBob,
      );

      await collateralAggregatorProxy.rebalanceBetween(
        bob,
        alice,
        carol,
        rebalanceAmtBob,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](bob, alice);
      lockedCollateral[0].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address,address)'](
        bob,
        carol,
      );
      lockedCollateral[0].toString().should.be.equal('0');
      lockedCollateral[1].toString().should.be.equal('0');
    });

    it("Rebalance between Alice's position with Bob to Carol, validate state changes", async () => {
      let rebalanceAmt = aliceMaxWithdraw.div(toBN(2));
      let lockedAmtAlice = aliceLockedTokens.div(toBN(2));

      await collateralAggregatorProxy.rebalanceBetween(
        alice,
        bob,
        carol,
        rebalanceAmt,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollateral[0].toString().should.be.equal(lockedAmtAlice.toString());
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address,address)'](
        alice,
        carol,
      );
      lockedCollateral[0].toString().should.be.equal(lockedAmtAlice.toString());
      lockedCollateral[1].toString().should.be.equal('0');
    });

    it("Rebalance from Alice's position with Bob more than deposited by Alice, validate correct rebalance state changes", async () => {
      let rebalanceAmt = aliceMaxWithdraw;
      let lockedAmtAlice = aliceLockedTokens.div(toBN(2));

      await collateralAggregatorProxy.rebalanceFrom(
        alice,
        bob,
        rebalanceAmt,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollateral[0].toString().should.be.equal('0');
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address)'](alice);
      lockedCollateral.toString().should.be.equal(lockedAmtAlice.toString());
      let independentCollateral = await vault.getIndependentCollateral(alice);
      independentCollateral
        .toString()
        .should.be.equal(lockedAmtAlice.toString());
    });

    it("Rebalance between Alice's position with Bob to Carol more than deposited by Alice, validate correct rebalance state changes", async () => {
      let rebalanceAmtToETH = aliceMaxWithdraw.div(toBN(5));
      let rebalanceAmtToTokens = aliceLockedTokens.div(toBN(5));

      let rebalanceAmt = aliceMaxWithdraw;
      aliceLockedInPositionWithCarol = aliceLockedTokens
        .div(toBN(2))
        .add(rebalanceAmtToTokens);

      await collateralAggregatorProxy.rebalanceTo(
        alice,
        bob,
        rebalanceAmtToETH,
        vault.address,
      );
      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollateral[0]
        .toString()
        .should.be.equal(rebalanceAmtToTokens.toString());
      lockedCollateral[1].toString().should.be.equal('0');

      await collateralAggregatorProxy.rebalanceBetween(
        alice,
        bob,
        carol,
        rebalanceAmt,
        vault.address,
      );
      lockedCollateral = await vault['getLockedCollateral(address,address)'](
        alice,
        bob,
      );
      lockedCollateral[0].toString().should.be.equal('0');
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address,address)'](
        alice,
        carol,
      );
      lockedCollateral[0]
        .toString()
        .should.be.equal(aliceLockedInPositionWithCarol.toString());
      lockedCollateral[1].toString().should.be.equal('0');
    });
  });

  describe('Test collateral vault liquidation functionality', () => {
    let carolLockedInPositionWithAlice;

    it('Liquidate all collateral from Alice to Carol, validate state changes', async () => {
      let liquidationAmt = await currencyControllerProxy.convertToETH(
        hexFILString,
        aliceLockedInPositionWithCarol,
      );
      carolLockedInPositionWithAlice = aliceLockedInPositionWithCarol;
      aliceLockedInPositionWithCarol = ZERO_BN;

      await collateralAggregatorProxy.liquidate(
        alice,
        carol,
        liquidationAmt,
        vault.address,
      );
      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](carol, alice);
      lockedCollateral[0]
        .toString()
        .should.be.equal(carolLockedInPositionWithAlice.toString());
      lockedCollateral[1]
        .toString()
        .should.be.equal(aliceLockedInPositionWithCarol.toString());

      lockedCollateral = await vault['getLockedCollateral(address)'](carol);
      lockedCollateral
        .toString()
        .should.be.equal(carolLockedInPositionWithAlice.toString());
    });

    it('Try to liquidate collateral from empty side Alice to Carol using independent collateral, validate state changes', async () => {
      let liquidationAmt = decimalBase.mul(toBN('100'));
      carolLockedInPositionWithAlice =
        carolLockedInPositionWithAlice.add(liquidationAmt);

      liquidationAmt = await currencyControllerProxy.convertToETH(
        hexFILString,
        liquidationAmt,
      );

      await collateralAggregatorProxy.liquidate(
        alice,
        carol,
        liquidationAmt,
        vault.address,
      );

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](carol, alice);
      lockedCollateral[0]
        .toString()
        .should.be.equal(carolLockedInPositionWithAlice.toString());
      lockedCollateral[1].toString().should.be.equal('0');

      lockedCollateral = await vault['getLockedCollateral(address)'](carol);
      lockedCollateral
        .toString()
        .should.be.equal(carolLockedInPositionWithAlice.toString());
    });

    it('Try to liquidate too much collateral from Carol to Alice, validate correct liquidation state changes', async () => {
      let liquidationAmt = decimalBase.mul(toBN('10000'));
      liquidationAmt = await currencyControllerProxy.convertToETH(
        hexFILString,
        liquidationAmt,
      );

      await collateralAggregatorProxy.liquidate(
        carol,
        alice,
        liquidationAmt,
        vault.address,
      );

      aliceLockedInPositionWithCarol = carolLockedInPositionWithAlice;
      carolLockedInPositionWithAlice = ZERO_BN;

      let lockedCollateral = await vault[
        'getLockedCollateral(address,address)'
      ](carol, alice);
      lockedCollateral[0]
        .toString()
        .should.be.equal(carolLockedInPositionWithAlice.toString());
      lockedCollateral[1]
        .toString()
        .should.be.equal(aliceLockedInPositionWithCarol.toString());

      lockedCollateral = await vault['getLockedCollateral(address)'](carol);
      lockedCollateral.toString().should.be.equal('0');
    });
  });

  describe('Test collateral vault withdawal functionality', () => {
    let withdrawAmt;

    it('Try to withdraw more collateral than provided by Alice, validate correct balance changes', async () => {
      const [, aliceSigner] = await ethers.getSigners();

      let aliceMaxWithdraw = await vault.getIndependentCollateralInETH(alice);
      let aliceMaxWithdrawTokens = await vault.getIndependentCollateral(alice);

      await collateralAggregatorProxy.setMaxCollateralBookWidthdraw(
        alice,
        aliceMaxWithdraw,
      );
      aliceMaxWithdraw
        .toString()
        .should.be.equal(
          (
            await collateralAggregatorProxy.getMaxCollateralBookWidthdraw(alice)
          ).toString(),
        );

      withdrawAmt = aliceMaxWithdrawTokens.mul(2);

      let independentCollateral = await vault.getIndependentCollateral(alice);
      independentCollateral
        .toString()
        .should.be.equal(aliceMaxWithdrawTokens.toString());

      let aliceTokenBalance = await tokenContract.balanceOf(alice);
      aliceTokenBalance.toString().should.be.equal('0');

      await vault
        .connect(aliceSigner)
        ['withdraw(uint256)'](withdrawAmt.toString());

      checkTokenBalances([alice], [aliceMaxWithdrawTokens], tokenContract);

      independentCollateral = await vault.getIndependentCollateral(alice);
      independentCollateral.toString().should.be.equal('0');

      let vaults = await collateralAggregatorProxy.getUsedVaults(alice);
      vaults.includes(vault.address).should.be.equal(true); // expect no exit from vault as there is some tokens locked
    });

    it('Try to withdraw by Bob from empty collateral book, expect no balance changes', async () => {
      const [, , bobSigner] = await ethers.getSigners();

      withdrawAmt = decimalBase.mul(toBN('10'));

      let vaultBalanceBefore = await tokenContract.balanceOf(vault.address);

      checkTokenBalances([bob], [bobTokenBalance], tokenContract);

      await vault
        .connect(bobSigner)
        ['withdraw(uint256)'](withdrawAmt.toString());

      checkTokenBalances(
        [bob, vault.address],
        [bobTokenBalance, vaultBalanceBefore],
        tokenContract,
      );
    });

    it('Try to withdraw by Bob from empty collateral book, even with corrupted aggregator, expect revert', async () => {
      const [, , bobSigner] = await ethers.getSigners();

      let bobMaxWithdraw = await currencyControllerProxy.convertToETH(
        hexFILString,
        withdrawAmt,
      );
      await collateralAggregatorProxy.setMaxCollateralBookWidthdraw(
        bob,
        bobMaxWithdraw,
      );

      await expectRevert(
        vault.connect(bobSigner)['withdraw(uint256)'](withdrawAmt.toString()),
        overflowErrorMsg,
      );
    });

    it('Try to withdraw by Bob from empty position with Carol, with corrupted aggregator, expect no balance changes', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      let maxWithdraw = decimalBase.mul(toBN('100'));
      await collateralAggregatorProxy.setMaxCollateralWidthdraw(
        bob,
        carol,
        maxWithdraw,
        maxWithdraw,
      );

      let vaultBalanceBefore = await tokenContract.balanceOf(vault.address);

      let bobBalanceBefore = await tokenContract.balanceOf(bob);
      bobBalanceBefore.toString().should.be.equal(bobTokenBalance.toString());

      await vault
        .connect(bobSigner)
        .withdrawFrom(carol, withdrawAmt.toString());

      checkTokenBalances(
        [bob, vault.address],
        [bobTokenBalance, vaultBalanceBefore],
        tokenContract,
      );
    });

    it('Try to deposit by Bob into position with Carol and withdraw all amounts, validate correct balance changes', async () => {
      const [, , bobSigner] = await ethers.getSigners();

      await tokenContract.approveInternal(
        bob,
        vault.address,
        bobTokenBalance.toString(),
      );
      await vault
        .connect(bobSigner)
        ['deposit(address,uint256)'](carol, bobTokenBalance.toString());

      let bobMaxWithdraw = await currencyControllerProxy.convertToETH(
        hexFILString,
        bobTokenBalance.toString(),
      );
      await collateralAggregatorProxy.setMaxCollateralWidthdraw(
        bob,
        carol,
        bobMaxWithdraw.toString(),
        '0',
      );

      let vaultBalanceBefore = await tokenContract.balanceOf(vault.address);

      let bobBalanceBefore = await tokenContract.balanceOf(bob);
      bobBalanceBefore.toString().should.be.equal('0');

      await vault
        .connect(bobSigner)
        .withdrawFrom(carol, bobTokenBalance.toString());

      checkTokenBalances(
        [bob, vault.address],
        [bobTokenBalance, vaultBalanceBefore.sub(bobTokenBalance)],
        tokenContract,
      );
    });
  });
});
