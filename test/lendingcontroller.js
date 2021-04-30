const Collateral = artifacts.require('Collateral');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const Loan = artifacts.require('Loan');
const FXRatesAggregator = artifacts.require('FXRatesAggregator');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { should } = require('chai');
should();

const {Ccy, Term, sample} = require('../test-utils').constants;
const { emitted, reverted } = require('../test-utils').assert;
const { orders } = require("./orders");

const expectRevert = reverted;
const effectiveSec = 60 * 60 * 24 * 14; // 14 days

/* Helper */
const val = (obj) => {
    if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
    return Object.values(obj);
};  

contract('LendingMarketController', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    const users = [alice, bob, carol]; // without owner
    const filRate = web3.utils.toBN("67175250000000000");
    const filAddr = web3.utils.utf8ToHex("f01523555");
    const btcAddr = web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4gingrN45Y4");

    let collateral;
    let loan;  
    let lendingController;
    let lendingMarkets = [];
    let orderList;

    before('deploy LendingMarketController', async () => {
        loan = await Loan.new();

        collateral = await Collateral.new(loan.address);
        await loan.setCollateralAddr(collateral.address, {from: owner});
        
        ratesAggregator = await FXRatesAggregator.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.FIL, filRate);
        setPriceFeedTx = await ratesAggregator.linkPriceFeed(Ccy.FIL, filToETHPriceFeed.address, true);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');

        await collateral.setRatesAggregatorAddr(ratesAggregator.address, {from: owner});
    
        orderList = orders;
        lendingController = await LendingMarketController.new();

        console.log();
        console.log('lending market controller addr is', lendingController.address);
        console.log();
    });

    describe('Init Collateral with 100,000 Wei for Bob', async () => {
        it('Register collateral book with 100,000 Wei payment', async () => {
            let result = await collateral.register("Bob", "f01523555", "3LvFB9E2rqjnvHmjUbQqpcc4gingrN45Y4", {from: bob, value: 100000});
            await emitted(result, 'Register');
        });

        it('Get Bob collateral book and check values', async () => {
            const book = await collateral.getOneBook(bob);
            
            book[0].should.be.equal('Bob');
            book[1].should.be.equal(filAddr);
            book[2].should.be.equal(btcAddr);
            book[3].should.be.equal('100000');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');
        });
      });
  
    describe('deploy Lending Markets for each term of FIL market', async () => {
        it('deploy Lending Market for 3 month FIL market', async () => {
            _3mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._3m);
            await emitted(_3mMarket, "LendingMarketCreated");
            lendingMarkets.push(_3mMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_3mMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._3m, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._3m, lendingMarket.address, {from: owner});        
        });

        it('deploy Lending Market for 6 month FIL market', async () => {
            _6mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._6m);
            await emitted(_6mMarket, "LendingMarketCreated");
            lendingMarkets.push(_6mMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_6mMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._6m, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._6m, lendingMarket.address, {from: owner});        
        });

        it('deploy Lending Market for 1 year FIL market', async () => {
            _1yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._1y);
            await emitted(_1yMarket, "LendingMarketCreated");
            lendingMarkets.push(_1yMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_1yMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._1y, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._1y, lendingMarket.address, {from: owner});        
        });

        it('deploy Lending Market for 2 year FIL market', async () => {
            _2yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._2y);
            await emitted(_2yMarket, "LendingMarketCreated");
            lendingMarkets.push(_2yMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_2yMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._2y, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._2y, lendingMarket.address, {from: owner});        
        });

        it('deploy Lending Market for 3 year FIL market', async () => {
            _3yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._3y);
            await emitted(_3yMarket, "LendingMarketCreated");
            lendingMarkets.push(_3yMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_3yMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._3y, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._3y, lendingMarket.address, {from: owner});        
        });

        it('deploy Lending Market for 5 year FIL market', async () => {
            _5yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._5y);
            await emitted(_5yMarket, "LendingMarketCreated");
            lendingMarkets.push(_5yMarket.logs[0].args.marketAddr);

            let lendingMarket = await LendingMarket.at(_5yMarket.logs[0].args.marketAddr);
            await lendingMarket.setCollateral(collateral.address, {from: owner});
            await lendingMarket.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._5y, lendingMarket.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._5y, lendingMarket.address, {from: owner});        
        });

        it('Expect revert on adding new 3m FIL market', async () => {
            await expectRevert(
                lendingController.deployLendingMarket(Ccy.FIL, Term._3m),
                "Couldn't rewrite existing market",
            );
        });
        
        it('initiate lend orders for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                amount = orderList[i]["amount"];
                orderId = orderList[i]["orderId"];
                rate = orderList[i]["rate"];
      
                let marketOrder = await lendingMarket.order(0, amount, rate, effectiveSec, {from: bob});
                await emitted(marketOrder, 'MakeOrder');      
            }
        });

        it('initiate borrow orders for each market', async () => {
            for (i=0; i < lendingMarkets.length; i++) {
                let lendingMarket = await LendingMarket.at(lendingMarkets[i]);
                amount = orderList[i]["amount"];
                orderId = orderList[i]["orderId"];
                rate = orderList[i]["rate"];
      
                let marketOrder = await lendingMarket.order(1, amount, rate+25, effectiveSec, {from: bob});
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
            let rate = await lendingController.getLendRatesForCcy(Ccy.FIL, {from: bob});
            rate[0].toNumber().should.be.equal(800);
            rate[1].toNumber().should.be.equal(800);
            rate[2].toNumber().should.be.equal(800);
            rate[3].toNumber().should.be.equal(800);
            rate[4].toNumber().should.be.equal(800);
            rate[5].toNumber().should.be.equal(800);
        });

        it('get borrow rates from lending controller for FIL', async () => {
            let rate = await lendingController.getBorrowRatesForCcy(Ccy.FIL, {from: bob});
            rate[0].toNumber().should.be.equal(825);
            rate[1].toNumber().should.be.equal(825);
            rate[2].toNumber().should.be.equal(825);
            rate[3].toNumber().should.be.equal(825);
            rate[4].toNumber().should.be.equal(825);
            rate[5].toNumber().should.be.equal(825);
        });

        it('get mid rates from lending controller for FIL', async () => {
            let rate = await lendingController.getMidRatesForCcy(Ccy.FIL, {from: bob});
            rate[0].toNumber().should.be.equal(812);
            rate[1].toNumber().should.be.equal(812);
            rate[2].toNumber().should.be.equal(812);
            rate[3].toNumber().should.be.equal(812);
            rate[4].toNumber().should.be.equal(812);
            rate[5].toNumber().should.be.equal(812);
        });

        it('get discount factors from lending controller for FIL', async () => {
            let rate = await lendingController.getDiscountFactorsForCcy(Ccy.FIL, {from: bob});
            console.log("df3m: " + rate[0]);
            console.log("df6m: " + rate[1]);
            console.log("df1y: " + rate[2]);
            console.log("df2y: " + rate[3]);
            console.log("df3y: " + rate[4]);
            console.log("df4y: " + rate[5]);
            console.log("df5y: " + rate[6]);
        });
    });
});