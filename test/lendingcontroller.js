const CollateralAggregator = artifacts.require('CollateralAggregator');
const LendingMarket = artifacts.require('LendingMarket');
const CurrencyController = artifacts.require('CurrencyController');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { should } = require('chai');
should();

const { hexFILString, loanPrefix } = require('../test-utils').strings;
const { termDays, termsDfFracs, termsNumPayments, termsSchedules, sortedTermDays } = require('../test-utils').terms;
const { emitted, reverted } = require('../test-utils').assert;
const { orders } = require("./orders");

const expectRevert = reverted;

contract('LendingMarketController', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    const users = [alice, bob, carol]; // without owner
    const filRate = web3.utils.toBN("67175250000000000");
    let filToETHPriceFeed;

    let currencyController;
    let collateral;
    let signers;
    let loan;
    let lendingController;
    let lendingMarkets = [];
    let orderList;
    let productResolver;
    let termStructure;

    before('deploy LendingMarketController', async () => {
        signers = await ethers.getSigners();
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

        currencyController = await CurrencyController.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, hexFILString, filRate);
        let tx = await currencyController.supportCurrency(hexFILString, "Filecoin", 461, filToETHPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        const termStructureFactory = await ethers.getContractFactory(
            'TermStructure',
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
                    DealId: dealIdLibrary.address,
                    DiscountFactor: discountFactor.address,
                }
              }
            )
        loan = await loanFactory.deploy();
        collateral = await CollateralAggregator.new();

        await loan.setCollateralAddr(collateral.address, {from: owner});
        await collateral.setCurrencyControler(currencyController.address, {from: owner});
    
        orderList = orders;

        const lendingControllerFactory = await ethers.getContractFactory(
            'LendingMarketController',
            {
                libraries: {
                    QuickSort: quickSortLibrary.address,
                    DiscountFactor: discountFactor.address,
                }
              }
            )
        lendingController = await lendingControllerFactory.deploy();
        await lendingController.setCurrencyController(currencyController.address);
        await lendingController.setTermStructure(termStructure.address);
        await loan.setLendingControllerAddr(lendingController.address);

        await productResolver.registerProduct(loanPrefix, loan.address, lendingController.address);

        for (i = 0; i < termDays.length; i++) {
            await termStructure.supportTerm(
                termDays[i], 
                termsDfFracs[i], 
                termsNumPayments[i], 
                termsSchedules[i], 
                [loanPrefix], 
                [hexFILString]
            );
        }

        console.log();
        console.log('lending market controller addr is', lendingController.address);
        console.log();
    });

    describe('Init Collateral with 100,000 Wei for Bob', async () => {
        it('Register collateral book with 100,000 Wei payment', async () => {
            let result = await collateral.register({from: bob, value: 100000});
            await emitted(result, 'Register');
        });
    });

    describe('deploy Lending Markets for each term of FIL market', async () => {
        it('deploy Lending Markets for each term for FIL market', async () => {
            for (let i=0; i<termDays.length; i++) {
                const tx = await lendingController.deployLendingMarket(hexFILString, termDays[i]);
                const receipt = await tx.wait();
                lendingMarkets.push(receipt.events[0].args.marketAddr);
                
                let lendingMarket = await LendingMarket.at(receipt.events[0].args.marketAddr);
                console.log('deployed market with ' + receipt.events[0].args.marketAddr + ' address');
                await lendingMarket.setCollateral(collateral.address, {from: owner});
                await lendingMarket.setLoan(loan.address, {from: owner});
                await collateral.addCollateralUser(lendingMarket.address, {from: owner});
                await loan.addLendingMarket(hexFILString, termDays[i], lendingMarket.address);
            }
        
            let terms = await lendingController.getSupportedTerms(hexFILString);
            terms.map((term, i) => {
                term.toString().should.be.equal(sortedTermDays[i].toString());
            })
        });

        it('Expect revert on adding new 3m FIL market', async () => {
            await expectRevert(
                lendingController.deployLendingMarket(hexFILString, termDays[0]),
                "Couldn't rewrite existing market",
            );
        });
        
        it('initiate lend orders for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                amount = orderList[i]["amount"];
                orderId = orderList[i]["orderId"];
                rate = orderList[i]["rate"];
      
                let marketOrder = await lendingMarket.order(0, amount, rate, {from: bob});
                await emitted(marketOrder, 'MakeOrder');      
            }
        });

        it('initiate borrow orders for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                amount = orderList[i]["amount"];
                orderId = orderList[i]["orderId"];
                rate = orderList[i]["rate"];
      
                let marketOrder = await lendingMarket.order(1, amount, rate+25, {from: bob});
                await emitted(marketOrder, 'MakeOrder');      
            }
        });

        it('get lend rate for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                let rate = await lendingMarket.getLendRate({from: bob});
                rate.toNumber().should.be.equal(800);
            }
        });

        it('get borrow rate for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                let rate = await lendingMarket.getBorrowRate({from: bob});
                rate.toNumber().should.be.equal(825);
            }
        });
    
        it('get mid rate for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                let rate = await lendingMarket.getMidRate({from: bob});
                rate.toNumber().should.be.equal(812);
            }
        });

        it('get lend rates from lending controller for FIL', async () => {
            let rate = await lendingController.getLendRatesForCcy(hexFILString);
            rate[0].toNumber().should.be.equal(800);
            rate[1].toNumber().should.be.equal(800);
            rate[2].toNumber().should.be.equal(800);
            rate[3].toNumber().should.be.equal(800);
            rate[4].toNumber().should.be.equal(800);
            rate[5].toNumber().should.be.equal(800);
        });

        it('get borrow rates from lending controller for FIL', async () => {
            let rate = await lendingController.getBorrowRatesForCcy(hexFILString);
            rate[0].toNumber().should.be.equal(825);
            rate[1].toNumber().should.be.equal(825);
            rate[2].toNumber().should.be.equal(825);
            rate[3].toNumber().should.be.equal(825);
            rate[4].toNumber().should.be.equal(825);
            rate[5].toNumber().should.be.equal(825);
        });

        it('get mid rates from lending controller for FIL', async () => {
            let rate = await lendingController.getMidRatesForCcy(hexFILString);
            rate[0].toNumber().should.be.equal(812);
            rate[1].toNumber().should.be.equal(812);
            rate[2].toNumber().should.be.equal(812);
            rate[3].toNumber().should.be.equal(812);
            rate[4].toNumber().should.be.equal(812);
            rate[5].toNumber().should.be.equal(812);
        });

        it('get discount factors from lending controller for FIL', async () => {
            let rate = await lendingController.getDiscountFactorsForCcy(hexFILString);
            console.log("df3m: " + rate[0][0]);
            console.log("df6m: " + rate[0][1]);
            console.log("df1y: " + rate[0][2]);
            console.log("df2y: " + rate[0][3]);
            console.log("df3y: " + rate[0][4]);
            console.log("df4y: " + rate[0][5]);
            console.log("df5y: " + rate[0][6]);
        });
    });
});