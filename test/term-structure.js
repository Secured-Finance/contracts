const CurrencyController = artifacts.require('CurrencyController');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const LendingMarketControllerMock = artifacts.require('LendingMarketControllerMock');

const { emitted, reverted, equal } = require('../test-utils').assert;
const { ethers } = require('hardhat');
const { toBytes32 } = require('../test-utils').strings;
const { should } = require('chai');

const utils = require('web3-utils');

const expectRevert = reverted;
should();

contract('TermStructure', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let termStructure;
    let currencyController;
    let productResolver;
    let loanPrefix = "0x21aaa47b";

    let filToETHRate = web3.utils.toBN("67175250000000000");
    let ethToUSDRate = web3.utils.toBN("232612637168");
    let btcToETHRate = web3.utils.toBN("23889912590000000000");

    let filToETHPriceFeed;
    let btcToETHPriceFeed;
    let ethToUSDPriceFeed;

    let hexFILString = toBytes32("FIL");
    let hexETHString = toBytes32("ETH");
    let hexBTCString = toBytes32("BTC");

    const generateId = (value, prefix) => {
        let right = utils.toBN(utils.rightPad(prefix, 64));
        let left = utils.toBN(utils.leftPad(value, 64));
    
        let id = utils.numberToHex(right.or(left));

        return id;
    };

    before('deploy TermStructure contract', async () => {
        currencyController = await CurrencyController.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, hexFILString, filToETHRate);
        ethToUSDPriceFeed = await MockV3Aggregator.new(8, hexETHString, ethToUSDRate);
        btcToETHPriceFeed = await MockV3Aggregator.new(18, hexBTCString, btcToETHRate);

        let tx = await currencyController.supportCurrency(hexETHString, "Ethereum", 60, ethToUSDPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.supportCurrency(hexFILString, "Filecoin", 461, filToETHPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.supportCurrency(hexBTCString, "Bitcoin", 0, btcToETHPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.updateCollateralSupport(hexETHString, true);
        await emitted(tx, 'CcyCollateralUpdate');

        tx = await currencyController.updateMinMargin(hexETHString, 2500);
        await emitted(tx, 'MinMarginUpdated');

        signers = await ethers.getSigners();

        const DealId = await ethers.getContractFactory('DealId')
        const dealIdLibrary = await DealId.deploy();
        await dealIdLibrary.deployed();

        const QuickSort = await ethers.getContractFactory('QuickSort')
        const quickSortLibrary = await QuickSort.deploy();
        await quickSortLibrary.deployed();

        const productResolverFactory = await ethers.getContractFactory(
            'ProductAddressResolverTest',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
        productResolver = await productResolverFactory.deploy();

        const termStructureFactory = await ethers.getContractFactory(
            'TermStructureTest',
            {
                libraries: {
                    QuickSort: quickSortLibrary.address
                }
              }
            )
        termStructure = await termStructureFactory.deploy(currencyController.address, productResolver.address);

        const loanFactory = await ethers.getContractFactory(
            'LoanV2',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
        loan = await loanFactory.deploy();

        lendingController = await LendingMarketControllerMock.new();

        await productResolver.registerProduct(loanPrefix, loan.address, lendingController.address, {from: owner});

        let id = generateId(12, loanPrefix);
        let contract = await productResolver.getProductContractByDealId(id);
        contract.should.be.equal(loan.address);

        contract = await productResolver.getControllerContractByDealId(id);
        contract.should.be.equal(lendingController.address);
    });

    describe("Test register product function", async () => {
        it('Succesfully add new term via supportTerm function and check term creation', async () => {
            let schedule = ['180'];
            await termStructure.supportTerm(
                180, 5000, 1, [180], [loanPrefix], [hexETHString, hexBTCString, hexFILString], {from: owner}
            );

            let term = await termStructure.getTerm(180);
            term[0].toString().should.be.equal('180');
            term[1].toString().should.be.equal('5000');
            term[2].toString().should.be.equal('1');

            let paymentSchedule = await termStructure.getTermSchedule(90);
            paymentSchedule.map((days, i) => {
                days.toString().should.be.equal(schedule[i])
            });
        });

        it('Try to add term by Alice, expect revert', async () => {
            await expectRevert(
                termStructure.connect(signers[1]).supportTerm(
                    90, 2500, 1, [90], [loanPrefix], [hexFILString],
                    {from: alice}), ""
            );
            let term = await termStructure.connect(signers[0]).getTerm(90);
            term[0].toString().should.be.equal('0');
        });

        it('Succesfully add the rest of terms using supportTerm', async () => {
            let days = [90,1825,365,1095,730];
            let numPayments = [1,5,1,3,2];
            let dfFracs = [2500, 10000, 10000, 10000, 10000];
            let schedules = [
                ['90'],
                ['365', '730', '1095', '1460', '1825'],
                ['365'],
                ['365', '730', '1095'],
                ['365', '730']
            ];
            
            for (i = 0; i < days.length; i++) {
                await termStructure.supportTerm(
                    days[i], 
                    dfFracs[i], 
                    numPayments[i], 
                    schedules[i], 
                    [loanPrefix], 
                    [hexETHString, hexBTCString, hexFILString]
                );

                let term = await termStructure.getTerm(days[i]);
                term[0].toString().should.be.equal(days[i].toString());
                term[1].toString().should.be.equal(dfFracs[i].toString());
                term[2].toString().should.be.equal(numPayments[i].toString());
    
                let paymentSchedule = await termStructure.getTermSchedule(days[i]);
                paymentSchedule.map((days, j) => {
                    days.toString().should.be.equal(schedules[i][j])
                });
            }
        });
    });

    describe("Test term creation", async () => {
        it('Test terms sorting in getTermsForProductAndCcy function', async () => {
            let terms = await termStructure.getTermsForProductAndCcy(loanPrefix, hexFILString, true);

            terms.map((term) => {
                console.log(term.toString());
            });
        });

    });

    describe("Report gas consumption of view functions", async () => {
        it('Gas costs for getting contract addresses', async () => {
            let gasCost = await termStructure.getGasCostOfGetTerm(90);
            console.log("Gas cost for getting term information is " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetTermSchedule(90);
            console.log("Gas cost for getting term schedule is " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetNumDays(180);
            console.log("Gas cost for getting term number of days is " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetDfFrac(365);
            console.log("Gas cost for getting term discount factor fractions is " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetNumPayments(365);
            console.log("Gas cost for getting term number of payments is " + gasCost.toString() + " gas");
            
            gasCost = await termStructure.getGasCostOfIsSupportedTerm(730, loanPrefix, hexBTCString);
            console.log("Gas cost for verifying if term is supported is " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetTermsForProductAndCcy(loanPrefix, hexETHString, false);
            console.log("Gas cost for getting all supported terms for product and currency without sorting " + gasCost.toString() + " gas");

            gasCost = await termStructure.getGasCostOfGetTermsForProductAndCcy(loanPrefix, hexETHString, true);
            console.log("Gas cost for getting all supported terms for product and currency with sorting " + gasCost.toString() + " gas");
        });
    });

});