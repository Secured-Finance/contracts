const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const CollateralAggregatorCallerMock = artifacts.require('CollateralAggregatorCallerMock');
const MarkToMarket = artifacts.require('MarkToMarket');
const ERC20Mock = artifacts.require('ERC20Mock');
const WETH9Mock = artifacts.require('WETH9Mock');
const CurrencyController = artifacts.require('CurrencyController');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const PaymentAggregator = artifacts.require('PaymentAggregator');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const Liquidations = artifacts.require('Liquidations');
const LoanCallerMock = artifacts.require('LoanCallerMock');

const { emitted, reverted, equal } = require('../test-utils').assert;
const { checkTokenBalances } = require('../test-utils').balances;
const { 
    toBytes32, 
    hexFILString, 
    hexETHString, 
    hexBTCString,
    loanPrefix,
    zeroAddress,
} = require('../test-utils').strings;

const { 
    sortedTermDays,
    sortedTermsDfFracs, 
    sortedTermsNumPayments, 
    sortedTermsSchedules 
} = require('../test-utils').terms;

const { 
    ZERO_BN, 
    decimalBase, 
    toBN, 
    IR_BASE,
    filToETHRate,
    ethToUSDRate,
    btcToETHRate
} = require('../test-utils').numbers;
const { generateId } = require('../test-utils').dealId;

const utils = require('web3-utils');
const { should } = require('chai');

should();

const expectRevert = reverted;

contract('CollateralAggregatorV2', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let collateral;
    let collateralCaller;
    let filVault;
    let ethVault;

    let filToETHPriceFeed;

    let alice_tFIL_locked;
    let alice_tFIL_balance;
    let alice_ETH_locked;
    let alice_ETH_balance;

    let bob_tFIL_locked;
    let bob_tFIL_balance;
    let bob_ETH_locked;
    let bob_ETH_balance;

    const netBilateralPVs = async (
        unsettled0PV,
        unsettled1PV,
        party0PV,
        party1PV
    ) => {
        let netPV0, netPV1;
        let expDiff0 = ZERO_BN;
        let expDiff1 = ZERO_BN;
        let haircutPV0 = party0PV.mul(toBN('750')).div(toBN('1000'));
        let haircutPV1 = party1PV.mul(toBN('750')).div(toBN('1000'));

        if (party0PV.gt(haircutPV1)) {
            expDiff0 = party0PV.sub(haircutPV1);
        }

        if (party1PV.gt(haircutPV0)) {
            expDiff1 = party1PV.sub(haircutPV0);
        }

        if (expDiff0.gt(expDiff1)) {
            netPV0 = expDiff0.sub(expDiff1).add(unsettled0PV);
            netPV1 = unsettled1PV;
        } else {
            netPV1 = expDiff1.sub(expDiff0).add(unsettled1PV);
            netPV0 = unsettled0PV;
        }

        let totalPV0 = party0PV.add(unsettled0PV);
        let totalPV1 = party1PV.add(unsettled1PV);

        return [netPV0, netPV1, totalPV0, totalPV1];
    }

    before('deploy CollateralVault, CollateralAggregator, CurrencyController, price feeds and ERC20 mock contracts', async () => {
        const DealId = await ethers.getContractFactory('DealId')
        const dealIdLibrary = await DealId.deploy();
        await dealIdLibrary.deployed();

        const QuickSort = await ethers.getContractFactory('QuickSort')
        const quickSortLibrary = await QuickSort.deploy();
        await quickSortLibrary.deployed();

        const DiscountFactor = await ethers.getContractFactory('DiscountFactor')
        const discountFactor = await DiscountFactor.deploy();
        await discountFactor.deployed();

        const productResolverFactory = await ethers.getContractFactory(
            'ProductAddressResolver',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
        productResolver = await productResolverFactory.deploy();

        markToMarket = await MarkToMarket.new(productResolver.address);
        paymentAggregator = await PaymentAggregator.new();
        await paymentAggregator.setMarkToMarket(markToMarket.address);

        closeOutNetting = await CloseOutNetting.new(paymentAggregator.address);
        await paymentAggregator.setCloseOutNetting(closeOutNetting.address);

        filToETHPriceFeed = await MockV3Aggregator.new(18, hexFILString, filToETHRate);
        ethToUSDPriceFeed = await MockV3Aggregator.new(8, hexETHString, ethToUSDRate);
        btcToETHPriceFeed = await MockV3Aggregator.new(18, hexBTCString, btcToETHRate);

        currencyController = await CurrencyController.new();
        await currencyController.supportCurrency(hexETHString, "Ethereum", 60, ethToUSDPriceFeed.address, 7500);
        await currencyController.supportCurrency(hexFILString, "Filecoin", 461, filToETHPriceFeed.address, 7500);
        await currencyController.supportCurrency(hexBTCString, "Bitcoin", 0, btcToETHPriceFeed.address, 7500);

        await currencyController.updateCollateralSupport(hexETHString, true);
        await currencyController.updateCollateralSupport(hexFILString, true);

        const termStructureFactory = await ethers.getContractFactory(
            'TermStructure',
            {
                libraries: {
                    QuickSort: quickSortLibrary.address
                }
              }
            )
        termStructure = await termStructureFactory.deploy(currencyController.address, productResolver.address);

        for (i = 0; i < sortedTermDays.length; i++) {
            await termStructure.supportTerm(
                sortedTermDays[i], 
                [], 
                []
            );
        }

        alice_tFIL_balance = decimalBase.mul(toBN('1000'));
        tFILToken = await ERC20Mock.new(
            toBytes32('Test FIL'),
            toBytes32("tFIL"),
            alice,
            alice_tFIL_balance
        );

        wETHToken = await WETH9Mock.new();

        collateral = await CollateralAggregatorV2.new();
        console.log('collateral is ' + collateral.address);
        collateralCaller = await CollateralAggregatorCallerMock.new(collateral.address);
        await collateral.setCurrencyController(currencyController.address);
        await collateral.addCollateralUser(collateralCaller.address);

        liquidations = await Liquidations.new(owner, 10);
        await liquidations.setCollateralAggregator(collateral.address);
        await liquidations.setProductAddressResolver(productResolver.address);
        await collateral.setLiquidationEngine(collateralCaller.address);

        const CollateralVault = await ethers.getContractFactory("CollateralVault");
    
        filVault = await CollateralVault.deploy(
            hexFILString,
            tFILToken.address,
            collateral.address,
            currencyController.address,
            wETHToken.address
        );
        await collateral.linkCollateralVault(filVault.address);

        console.log('filVault is ' + filVault.address);

        ethVault = await CollateralVault.deploy(
            hexETHString,
            wETHToken.address,
            collateral.address,
            currencyController.address,
            wETHToken.address
        );
        await collateral.linkCollateralVault(ethVault.address);
        console.log('ethVault is ' + ethVault.address);

        const lendingControllerFactory = await ethers.getContractFactory(
            'LendingMarketControllerMock',
            {
                libraries: {
                    DiscountFactor: discountFactor.address,
                }
              }
            )
        lendingController = await lendingControllerFactory.deploy();

        const loanFactory = await ethers.getContractFactory(
            'LoanV2',
            {
                libraries: {
                    DealId: dealIdLibrary.address,
                    DiscountFactor: discountFactor.address,
                }
              }
            )
        loan = await loanFactory.deploy();
        loanCaller = await LoanCallerMock.new(loan.address);

        await lendingController.setSupportedTerms(hexETHString, sortedTermDays);
        await lendingController.setSupportedTerms(hexFILString, sortedTermDays);
        await lendingController.setSupportedTerms(hexBTCString, sortedTermDays);

        await loan.setLendingControllerAddr(lendingController.address);
        await loan.addLendingMarket(hexFILString, '1825', loanCaller.address);
        await loan.addLendingMarket(hexFILString, '90', loanCaller.address);
        await loan.setPaymentAggregator(paymentAggregator.address);
        await loan.setCollateralAddr(collateral.address);
        await loan.setTermStructure(termStructure.address);
        await collateral.addCollateralUser(loan.address);
        await paymentAggregator.addPaymentAggregatorUser(loan.address);
        await liquidations.linkContract(loan.address);

        await productResolver.registerProduct(loanPrefix, loan.address, lendingController.address);

        const loanCurrencies = [hexETHString, hexFILString, hexBTCString];
        for (i = 0; i < sortedTermDays.length; i++) {
            for (j = 0; j < loanCurrencies.length; j++) {
                await termStructure.updateTermSupport(
                    sortedTermDays[i], 
                    loanPrefix, 
                    loanCurrencies[j],
                    true,
                );
            }
        }
    });

    describe('Test the execution of management functions', async () => {
        it('Check that contracts linked correctly to CollateralAggregator', async() => {
            let status = await collateral.isCollateralUser(collateralCaller.address);
            status.should.be.equal(true);

            status = await collateral.isCollateralUser(loan.address);
            status.should.be.equal(true);

            status = await collateral.isCollateralUser(zeroAddress);
            status.should.be.equal(false);

            status = await collateral.isCollateralVault(zeroAddress);
            status.should.be.equal(false);

            status = await collateral.isCollateralVault(filVault.address);
            status.should.be.equal(true);

            status = await collateral.isCollateralVault(ethVault.address);
            status.should.be.equal(true);
        });

        it('Try to trigger any changes, expect revert by different modifiers', async() => {
            await expectRevert(
                collateral.linkCollateralVault(zeroAddress, { from: alice }),
                "INVALID_ACCESS"
            );

            await expectRevert(
                collateral.linkCollateralVault(zeroAddress, { from: owner }),
                "Zero address"
            );

            await expectRevert(
                collateral.removeCollateralUser(loan.address, { from: bob }),
                "INVALID_ACCESS"
            );

            await expectRevert(
                collateral.removeCollateralVault(ethVault.address, { from: bob }),
                "INVALID_ACCESS"
            );

            await expectRevert(
                collateral.removeCollateralVault(zeroAddress, { from: owner }),
                "Can't remove non-existing user"
            );

            await expectRevert(
                collateral.updateMainParameters(12500, 10500, 10000, { from: alice }),
                "INVALID_ACCESS"
            );

            await expectRevert(
                collateral.updateMainParameters(12500, 12700, 10500, { from: owner }),
                "AUTO_LIQUIDATION_RATIO_OVERFLOW"
            );
        });

        it('Prepare the yield curve', async () => {
            const lendRates = [920, 1020, 1120, 1220, 1320, 1520];
            const borrowRates = [780, 880, 980, 1080, 1180, 1380];
            const midRates = [850, 950, 1050, 1150, 1250, 1450];

            await lendingController.setBorrowRatesForCcy(hexFILString, borrowRates);
            await lendingController.setLendRatesForCcy(hexFILString, lendRates);

            let rates = await lendingController.getMidRatesForCcy(hexFILString);
            rates.map((rate, i) => {
                rate.toNumber().should.be.equal(midRates[i])
            });
        });
    });

    describe('Test collateral deposits and withdraws in different vaults', async () => {
        it('Deposit all tFIL tokens into the vault by Alice, validate token balances', async () => {
            const [ , aliceSigner] = await ethers.getSigners();
            await collateral.register({ from: alice });
            await tFILToken.approveInternal(alice, filVault.address, alice_tFIL_balance);
            await filVault.connect(aliceSigner)['deposit(uint256)'](alice_tFIL_balance.toString());

            alice_tFIL_locked = alice_tFIL_balance;
            alice_tFIL_balance = ZERO_BN;

            await checkTokenBalances(
                [alice, filVault.address],
                [alice_tFIL_balance, alice_tFIL_locked],
                tFILToken
            );

            let vaults = await collateral.getUsedVaults(alice);
            vaults.includes(filVault.address).should.be.equal(true);
        });

        it('Mint 100 tFIL tokens for Bob and deposit them into the vault, validate token balances', async () => {
            const [ , , bobSigner] = await ethers.getSigners();
            const bobDeposit = decimalBase.mul(toBN('100'));

            await collateral.register({ from: bob });
            await tFILToken.mint(bob, bobDeposit);
            await tFILToken.approveInternal(bob, filVault.address, bobDeposit);
            await filVault.connect(bobSigner)['deposit(uint256)'](bobDeposit.toString());

            bob_tFIL_balance = ZERO_BN;
            bob_tFIL_locked = bobDeposit;

            await checkTokenBalances(
                [bob, filVault.address],
                [bob_tFIL_balance, bob_tFIL_locked.add(alice_tFIL_locked)],
                tFILToken
            );

            let vaults = await collateral.getUsedVaults(bob);
            vaults.includes(filVault.address).should.be.equal(true);
        });

        it('Deposit 1 ETH into the vault by Alice, validate wETH balances', async () => {
            const [ , aliceSigner] = await ethers.getSigners();
            let aliceBalanceBefore;
            let aliceBalanceAfter;

            let gasPrice;
            await web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));
            await web3.eth.getBalance(alice).then((res) => aliceBalanceBefore = web3.utils.toBN(res));

            await checkTokenBalances(
                [ethVault.address],
                [ZERO_BN],
                wETHToken
            );

            alice_ETH_locked = decimalBase.mul(toBN('1'));
            aliceBalanceAfter = aliceBalanceBefore.sub(alice_ETH_locked);

            let receipt = await (await ethVault.connect(aliceSigner)['deposit(uint256)'](
                alice_ETH_locked.toString(),
                { value: alice_ETH_locked.toString() }
                )).wait();
            const gasUsed = receipt.gasUsed;

            if (gasUsed != null) {
                aliceBalanceAfter = await (aliceBalanceAfter.sub(web3.utils.toBN(gasUsed.toString()).mul(gasPrice)));
            }

            await checkTokenBalances(
                [ethVault.address],
                [alice_ETH_locked],
                wETHToken
            );

            let vaults = await collateral.getUsedVaults(alice);
            vaults.includes(ethVault.address).should.be.equal(true);
        });

        it('Try to withdraw 1000 FIL from the vault by Alice, validate collateral balances', async () => {
            const [ , aliceSigner] = await ethers.getSigners();            
            let withdrawAmt = alice_tFIL_locked.mul(toBN(2));

            // expect revert on withdrawing double the amount of original deposit
            await expectRevert(
                filVault.connect(aliceSigner)['withdraw(uint256)'](withdrawAmt.toString()),
                "SafeMath: subtraction overflow"
            );
            
            // expect succesfull execution of full tFIL deposit withdraw
            await filVault.connect(aliceSigner)['withdraw(uint256)'](alice_tFIL_locked.toString()); 
            
            alice_tFIL_balance = alice_tFIL_locked;
            alice_tFIL_locked = ZERO_BN;

            await checkTokenBalances(
                [alice, filVault.address],
                [alice_tFIL_balance, bob_tFIL_locked],
                tFILToken
            );

            let vaults = await collateral.getUsedVaults(alice);
            vaults.includes(filVault.address).should.be.equal(false);

            let maxWithdraw = await collateral.getMaxCollateralBookWidthdraw(alice);
            maxWithdraw.toString().should.be.equal(decimalBase.mul(toBN('1')).toString());
        });

        it('Try to withdraw 2 ETH from the vault by Alice, withdraw 1 ETH instead, validate collateral balances', async () => {
            const [ , aliceSigner] = await ethers.getSigners();
            let aliceBalanceBefore;
            let aliceBalanceAfter;
        
            let maxWithdraw = await collateral.getMaxCollateralBookWidthdraw(alice);
            let withdrawAmt = maxWithdraw.mul(toBN(2));

            let gasPrice;
            await web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            await web3.eth.getBalance(alice).then((res) => aliceBalanceBefore = web3.utils.toBN(res));

            // expect successfull withdraw of only 1 ETH instead of 2 ETH
            let receipt = await (await ethVault.connect(aliceSigner)['withdraw(uint256)'](withdrawAmt.toString())).wait();
            const gasUsed = receipt.gasUsed;

            if (gasUsed != null) {
                aliceBalanceBefore = await (aliceBalanceBefore.sub(web3.utils.toBN(gasUsed.toString()).mul(gasPrice)));
            }

            await web3.eth.getBalance(alice).then((res) => aliceBalanceAfter = web3.utils.toBN(res));
            aliceBalanceAfter.toString().should.be.equal(aliceBalanceBefore.add(maxWithdraw).toString());

            // check that Alice didn't get WETH instead of native ETH
            await checkTokenBalances(
                [alice, ethVault.address],
                [ZERO_BN, ZERO_BN],
                wETHToken
            );
            
            let vaults = await collateral.getUsedVaults(alice);
            vaults.includes(ethVault.address).should.be.equal(false);
        });
    });

    describe("Test unsettled collateral exposure usage", async () => {
        let usedAmount;
        
        it('Try to lock 20% of 100 FIL unsettled collateral exposure by Bob, validate collateral usage', async () => {
            usedAmount = bob_tFIL_locked.mul(toBN(20)).div(toBN(100));
            let ethAmount = await currencyController.convertToETH(hexFILString, usedAmount);

            await collateralCaller.useUnsettledCollateral(
                bob,
                hexFILString,
                usedAmount
            );

            let unsettledExp = await collateral.getTotalUnsettledExp(bob);
            unsettledExp.toString().should.be.equal(ethAmount.toString());
        });

        it('Try to use 100 FIL more unsettled collateral exposure by Bob, expect revert as there is no collateral available', async () => {
            let useAmount = bob_tFIL_locked;

            await expectRevert(
                collateralCaller.useUnsettledCollateral(
                    bob,
                    hexFILString,
                    useAmount
                ),
                "Not enough collateral"
            );
        });

        it('Try to lock max available amount of FIL unsettled exposure by Bob, validate collateral usage', async () => {
            let leftForUse = bob_tFIL_locked.sub(usedAmount.mul(toBN(150)).div(toBN(100)));
            let useAmount = leftForUse.mul(toBN(100)).div(toBN(150));

            await collateralCaller.useUnsettledCollateral(
                bob,
                hexFILString,
                useAmount
            );

            let initialDeposit = await currencyController.convertToETH(hexFILString, bob_tFIL_locked);
            let expectedLock = initialDeposit.mul(toBN(100)).div(toBN(150));
            console.log(expectedLock.toString());

            let testLock = bob_tFIL_locked.div(toBN(150)).mul(toBN(100));
            console.log('testLock is ' + testLock.toString());

            let testUnsettledExp = await currencyController.convertToETH(hexFILString, '66666666666666666666');
            console.log('testUnsettledExp is ' + testUnsettledExp.toString());
            
            testUnsettledExp = await currencyController.convertToETH(hexFILString, '66666666666666666600');
            console.log('testUnsettledExp is ' + testUnsettledExp.toString());

            let unsettledExp = await collateral.getTotalUnsettledExp(bob);
            console.log('unsettledExp is ' + unsettledExp.toString());
            // console.log(initialDeposit.mul(toBN(100)).div(toBN(150)).toString());
            // unsettledExp.mul(toBN(150)).div(toBN(100)).toString().should.be.equal(initialDeposit.toString());

            withdrawable = await collateral.getMaxCollateralBookWidthdraw(bob);
            withdrawable.toString().should.be.equal('0');
        });

        it('Try to withdraw 100 FIL from the vault by Bob, expect revert on withdrawal as all collateral is locked', async () => {
            const [ , , bobSigner] = await ethers.getSigners();
            let withdrawAmt = bob_tFIL_locked;

            let coverage = await collateral.getUnsettledCoverage(bob);
            coverage.toString().should.be.equal('15000'); // should cover margin call

            await filVault.connect(bobSigner)['withdraw(uint256)'](withdrawAmt.toString());

            // expect no change in tFIL token balances
            await checkTokenBalances(
                [bob, filVault.address],
                [ZERO_BN, bob_tFIL_locked],
                tFILToken
            );
        });

        it('Try to release unsettled exposure for Alice, expect revert', async () => {
            let useAmount = decimalBase.mul(toBN('5')); // try to lock 5 FIL 

            await expectRevert(
                collateralCaller.releaseUnsettledCollateral(
                    alice,
                    hexFILString,
                    useAmount
                ),
                "SafeMath: subtraction overflow"
            );
        });

        it('Succesfully release all unsettled exposure for Bob, validate state changes', async () => {
            let filUnsettledExp = await collateral.unsettledCollateral(bob, hexFILString);

            await collateralCaller.releaseUnsettledCollateral(
                bob,
                hexFILString,
                filUnsettledExp
            );

            let maxWithdraw = await collateral.getMaxCollateralBookWidthdraw(bob);
            let filAmount = await currencyController.convertFromETH(hexFILString, maxWithdraw);
            filAmount.toString().should.be.equal(bob_tFIL_locked.toString());
        });
    });

    describe("Test collateral exposure usage in bilateral positions", async () => {
        let filAmount, ethAmount;
        let filRebalanceAmount, ethRebalanceAmount;

        it('Use collateral exposure for 30 FIL for Alice and Bob position, validate state changes', async () => {
            filAmount = decimalBase.mul(toBN('30'));
            filRebalanceAmount = filAmount.mul(toBN('150')).div(toBN('100'));

            ethAmount = await currencyController.convertToETH(hexFILString, filAmount);
            ethRebalanceAmount = ethAmount.mul(toBN('150')).div(toBN('100'));
            console.log(ethRebalanceAmount.toString());

            await collateralCaller.useCollateral(
                bob,
                alice,
                hexFILString,
                filAmount,
                ZERO_BN,
                false
            );

            let lockedCollateral = await filVault['getLockedCollateral(address)'](bob);
            lockedCollateral.toString().should.be.equal(filRebalanceAmount.toString());

            lockedCollateral = await filVault['getLockedCollateralInETH(address)'](bob);
            lockedCollateral.toString().should.be.equal(ethRebalanceAmount.toString());

            let vaults = await collateral.methods['getUsedVaults(address,address)'](alice, bob);
            vaults.includes(filVault.address).should.be.equal(true);

            let coverage = await collateral.getCoverage(alice, bob);
            coverage[0].toString().should.be.equal('0');
            coverage[1].toString().should.be.equal('15000');

            let ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            ccyExp[0].toString().should.be.equal('0');
            ccyExp[1].toString().should.be.equal(filAmount.toString());
        });

        it('Settle collateral exposure for 30 FIL between Alice and Bob, validate state changes', async () => {
            await collateralCaller.settleCollateral(
                bob,
                alice,
                hexFILString,
                filAmount,
                ZERO_BN
            );

            let ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            ccyExp[0].toString().should.be.equal('0');
            ccyExp[1].toString().should.be.equal('0');
            ccyExp[2].toString().should.be.equal('0');
            ccyExp[3].toString().should.be.equal(filAmount.toString());

            let lockedCollateral = await filVault['getLockedCollateral(address)'](bob);
            lockedCollateral.toString().should.be.equal(filRebalanceAmount.toString());

            lockedCollateral = await filVault['getLockedCollateralInETH(address)'](bob);
            lockedCollateral.toString().should.be.equal(ethRebalanceAmount.toString());
        });

        it('Try to settle collateral exposure for 50 FIL between Alice and Bob, expect revert as there is no exposure to settle', async () => {
            filAmount = decimalBase.mul(toBN('50'));

            await expectRevert(
                collateralCaller.settleCollateral(
                    alice,
                    bob,
                    hexFILString,
                    filAmount,
                    ZERO_BN
                ),
                "SafeMath: subtraction overflow"
            );
        });

        it('Try to release unsettled collateral exposure for 25 FIL between Alice and Bob, expect revert as there is no exposure to release', async () => {
            filAmount = decimalBase.mul(toBN('25'));

            await expectRevert(
                collateralCaller.releaseCollateral(
                    alice,
                    bob,
                    hexFILString,
                    filAmount,
                    ZERO_BN,
                    false
                ),
                "SafeMath: subtraction overflow"
            );
        });

        it('Succesfully release collateral for 10 FIL between Alice and Bob, validate state changes and collateral rebalance', async () => {
            filAmount = decimalBase.mul(toBN('10'));
            ethAmount = await currencyController.convertToETH(hexFILString, filAmount);

            await collateralCaller.releaseCollateral(
                bob,
                alice,
                hexFILString,
                filAmount,
                ZERO_BN,
                true
            );

            let initialUse = decimalBase.mul(toBN('30'));
            let pvTarget = initialUse.sub(filAmount);

            let lockedTarget = (pvTarget).mul(toBN('150')).div(toBN('100'));
            let lockedInETHTarget = await currencyController.convertToETH(hexFILString, lockedTarget);

            let coverage = await collateral.getCoverage(alice, bob);
            coverage[0].toString().should.be.equal('0');
            coverage[1].toString().should.be.equal('15000');

            let lockedCollateral = await filVault['getLockedCollateral(address)'](bob);
            lockedCollateral.toString().should.be.equal(lockedTarget.toString());

            lockedCollateral = await filVault['getLockedCollateralInETH(address)'](bob);
            lockedCollateral.toString().should.be.equal(lockedInETHTarget.toString());

            let ccyExp = await collateral.getCcyExposures(bob, alice, hexFILString);
            ccyExp[0].toString().should.be.equal('0');
            ccyExp[1].toString().should.be.equal('0');
            ccyExp[2].toString().should.be.equal(pvTarget.toString());
            ccyExp[3].toString().should.be.equal('0');
        });

        it('Update settled PV for Bob in position with Alice, validate state changes', async () => {
            let newPV = decimalBase.mul(toBN('25'));
            let prevPV = filAmount.mul(toBN('2'));

            await collateralCaller.updatePV(
                alice,
                bob,
                hexFILString,
                ZERO_BN,
                prevPV,
                ZERO_BN,
                newPV
            );

            let lockedTarget = (newPV).mul(toBN('150')).div(toBN('100'));
            let lockedCollateral = await filVault['getLockedCollateral(address)'](bob);
            lockedCollateral.toString().should.be.equal(lockedTarget.toString());

            let coverage = await collateral.getCoverage(alice, bob);
            coverage[0].toString().should.be.equal('0');
            coverage[1].toString().should.be.equal('15000');

            let ccyExp = await collateral.getCcyExposures(bob, alice, hexFILString);
            ccyExp[0].toString().should.be.equal('0');
            ccyExp[1].toString().should.be.equal('0');
            ccyExp[2].toString().should.be.equal(newPV.toString());
            ccyExp[3].toString().should.be.equal('0');
        });

        it('Try to update PV for Alice, expect revert as PV wasnt used for Alice', async () => {
            let prevPV = decimalBase.mul(toBN('10'));
            let newPV = filAmount.mul(toBN('11'));

            await expectRevert(
                collateralCaller.updatePV(
                    alice,
                    bob,
                    hexFILString,
                    prevPV,
                    ZERO_BN,
                    newPV,
                    ZERO_BN
                ),
                "SafeMath: subtraction overflow"
            );
        });

        it('Use settled collateral for Alice, validate FIL exposure netting between Alice and Bob', async () => {
            const [ , aliceSigner] = await ethers.getSigners();

            // Deposit 5 ETH for Alice in ETH. Check WETH balances
            let deposit = decimalBase.mul(toBN('5'));
            await (await ethVault.connect(aliceSigner)['deposit(uint256)'](
                deposit.toString(),
                { value: deposit.toString() }
            )).wait();

            await checkTokenBalances([ethVault.address], [deposit], wETHToken);

            let independentCollateral = await ethVault.getIndependentCollateral(alice);
            independentCollateral.toString().should.be.equal(deposit.toString());

            filAmount = decimalBase.mul(toBN('35'));

            await collateralCaller.useCollateral(
                alice,
                bob,
                hexFILString,
                filAmount,
                ZERO_BN,
                true
            );

            let ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            let netResult = await netBilateralPVs(ccyExp[0], ccyExp[1], ccyExp[2], ccyExp[3]);

            let targetNetPVs = await currencyController.convertBulkToETH(hexFILString, netResult);
            let actualNetPVs = await collateral.getNetAndTotalPV(alice, bob);
            actualNetPVs[0].toString().should.be.equal(targetNetPVs[0].toString());
            actualNetPVs[1].toString().should.be.equal(targetNetPVs[1].toString());
            actualNetPVs[2].toString().should.be.equal(targetNetPVs[2].toString());
            actualNetPVs[3].toString().should.be.equal(targetNetPVs[3].toString());

            let lockedTarget = targetNetPVs[0].mul(toBN('150')).div(toBN('100'));
            let lockedCollateral = await ethVault['getLockedCollateral(address)'](alice);
            lockedCollateral.toString().should.be.equal(lockedTarget.toString());

            let coverage = await collateral.getCoverage(alice, bob);
            console.log(coverage[0].toString());
            console.log(coverage[1].toString());
            coverage[0].toString().should.be.equal('15000');
            coverage[1].toString().should.be.equal('15000'); 
        });

        it('Use one more deal for 50 FIL for Alice, validate updated FIL exposures between Alice and Bob', async () => {
            const [ , aliceSigner] = await ethers.getSigners();
            let depositAmount = decimalBase.mul(toBN('30')); // deposit 30 FIL as additional collateral
            
            await tFILToken.approveInternal(alice, filVault.address, depositAmount);
            await filVault.connect(aliceSigner)['deposit(uint256)'](depositAmount.toString());

            filAmount = decimalBase.mul(toBN('50'));

            await collateralCaller.useCollateral(
                alice,
                bob,
                hexFILString,
                filAmount,
                ZERO_BN,
                true
            );

            let ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            let netResult = await netBilateralPVs(ccyExp[0], ccyExp[1], ccyExp[2], ccyExp[3]);

            let targetNetPVs = await currencyController.convertBulkToETH(hexFILString, netResult);
            let actualNetPVs = await collateral.getNetAndTotalPV(alice, bob);
            actualNetPVs[0].toString().should.be.equal(targetNetPVs[0].toString());
            actualNetPVs[1].toString().should.be.equal(targetNetPVs[1].toString());
            actualNetPVs[2].toString().should.be.equal(targetNetPVs[2].toString());
            actualNetPVs[3].toString().should.be.equal(targetNetPVs[3].toString());

            let lockedTarget = targetNetPVs[0].mul(toBN('150')).div(toBN('100'));
            let lockedCollateral = await ethVault['getLockedCollateral(address)'](alice);
            
            let aliceDepositWETH = decimalBase.mul(toBN('5'));
            lockedCollateral.toString().should.be.equal(aliceDepositWETH.toString());

            let lockedDiff = lockedTarget.sub(aliceDepositWETH);
            lockedTarget = await currencyController.convertFromETH(hexFILString, lockedDiff);
            console.log(lockedTarget.toString());

            lockedCollateral = await filVault['getLockedCollateral(address)'](alice);
            lockedCollateral.toString().should.be.equal(lockedTarget.toString());

            let coverage = await collateral.getCoverage(alice, bob);
            console.log(coverage[0].toString());
            console.log(coverage[1].toString());
        });
    });

    describe("Test collateral liquidations in bilateral positions", async () => {
        let filAmount, ethAmount;
        let filLiquidationAmount, ethLiquidationAmount;

        it('Liquidate a single deal for 50 FIL where Alice is the borrower, validate state changes', async () => {
            let alicePV = decimalBase.mul(toBN('35'));
            let bobPV = decimalBase.mul(toBN('25'));

            filAmount = decimalBase.mul(toBN('50'));
            filLiquidationAmount = filAmount.mul(toBN('120')).div(toBN('100'));
            ethLiquidationAmount = await currencyController.convertToETH(hexFILString, filLiquidationAmount);

            await collateralCaller.liquidate( // liquidate 50 FIL deal and release
                alice,
                bob,
                hexFILString,
                filAmount,
                true
            );

            let ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            ccyExp[0].toString().should.be.equal('0');
            ccyExp[1].toString().should.be.equal('0');
            ccyExp[2].toString().should.be.equal(alicePV.toString());
            ccyExp[3].toString().should.be.equal(bobPV.toString());

            let coverage = await collateral.getCoverage(alice, bob);
            coverage[0].toString().should.be.equal('15000');
            coverage[1].toString().should.be.equal('15000'); 
        });

        it('Try to liquidate too much PV for Bob, expect revert on liquidation', async () => {
            filAmount = decimalBase.mul(toBN('40'));
            await expectRevert(
                collateralCaller.liquidate(
                    bob,
                    alice,
                    hexFILString,
                    filAmount,
                    true
                ),
                "SafeMath: subtraction overflow"
            );
        });

        it('Liquidate a single deal for 25 FIL where Bob is borrower, validate state changes', async () => {
            filAmount = decimalBase.mul(toBN('25')); // liquidate existing PV
            filLiquidationAmount = filAmount.mul(toBN('120')).div(toBN('100'));
            ethLiquidationAmount = await currencyController.convertToETH(hexFILString, filLiquidationAmount);

            await collateralCaller.liquidate(
                bob,
                alice,
                hexFILString,
                filAmount,
                true
            );

            let ccyExp = await collateral.getCcyExposures(bob, alice, hexFILString);
            ccyExp[2].toString().should.be.equal('0');

            let coverage = await collateral.getCoverage(alice, bob);
            coverage[0].toString().should.be.equal('15000');
            coverage[1].toString().should.be.equal('0');
        });

        it('Try to liquidate empty PV for Bob, expect revert on release', async () => {
            filAmount = decimalBase.mul(toBN('5'));
            await expectRevert(
                collateralCaller.liquidate(
                    bob,
                    alice,
                    hexFILString,
                    filAmount,
                    true
                ),
                "SafeMath: subtraction overflow"
            );
        });

    });
});