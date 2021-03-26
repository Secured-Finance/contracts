const Collateral = artifacts.require('Collateral');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const Loan = artifacts.require('Loan');
const { should } = require('chai');
should();

const {Ccy, Term} = require('../test-utils').constants;
const { emitted, reverted } = require('../test-utils').assert;
const { orders } = require("./orders");

const expectRevert = reverted;
const effectiveSec = 60 * 60 * 24 * 14; // 14 days

contract('LendingMarketController', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    const users = [alice, bob, carol]; // without owner
  
    let lendingController;
    let lendingMarkets = [];
    let sample;
    let orderList;

    before('deploy LendingMarketController', async () => {
      orderList = orders;
      lendingController = await LendingMarketController.new();
      sample = await LendingMarket.new(Ccy.FIL, Term._1y);

      console.log();
      console.log('lending market controller addr is', lendingController.address);
      console.log();
    });

    describe('deploy Lending Markets for each term of FIL market', async () => {
        it('deploy Lending Market for 3 month FIL market', async () => {
            _3mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._3m);
            lendingMarkets.push(_3mMarket.logs[0].args.marketAddr);
        });

        it('deploy Lending Market for 6 month FIL market', async () => {
            _6mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._6m);
            lendingMarkets.push(_6mMarket.logs[0].args.marketAddr);
        });

        it('deploy Lending Market for 1 year FIL market', async () => {
            _1yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._1y);
            lendingMarkets.push(_1yMarket.logs[0].args.marketAddr);
        });

        it('deploy Lending Market for 2 year FIL market', async () => {
            _2yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._2y);
            lendingMarkets.push(_2yMarket.logs[0].args.marketAddr);
        });

        it('deploy Lending Market for 3 year FIL market', async () => {
            _3yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._3y);
            lendingMarkets.push(_3yMarket.logs[0].args.marketAddr);
        });

        it('deploy Lending Market for 5 year FIL market', async () => {
            _5yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._5y);
            lendingMarkets.push(_5yMarket.logs[0].args.marketAddr);
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