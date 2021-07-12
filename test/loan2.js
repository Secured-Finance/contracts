const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const LendingMarketController = artifacts.require('LendingMarketController');
const FXRatesAggregator = artifacts.require('FXRatesAggregator');
const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const {web3} = require("@openzeppelin/test-environment");
const { emitted, reverted, equal, notEqual, } = require('../test-utils').assert;
const {Side, Ccy, CcyPair, Term, ColState, sample, LoanState} = require('../test-utils').constants;
const { toDate, printCol, printLoan, printState, printSched, } = require('../test-utils/src/helper');
const { ONE_MINUTE, ONE_DAY, ONE_YEAR, NOTICE_GAP, SETTLE_GAP, advanceTimeAndBlock, takeSnapshot, revertToSnapshot, getLatestTimestamp, } = require('../test-utils').time;
const { should } = require('chai');
should();

const effectiveSec = 60 * 60 * 24 * 14; // 14 days
const expectRevert = reverted;


/* Helper */
const val = (obj) => {
    if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
    return Object.values(obj);
};  

const getDate = async () => {
  const currentTime = await getLatestTimestamp();
  return toDate(currentTime);
};

const expectEvent = async (res, eventName, msg) => {
    if (!msg) return await emitted(res, eventName);
    emitted(res, eventName, (ev) => {
      Object.keys(msg).forEach((key) => {
        equal(msg[key], String(ev[key]));
      });
      return true;
    });
};

contract('Loan', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let snapshotId;
    let collateral;
    let ratesAggregator;
    let loan;
    let lendingController;
    let lendingMarket;

    let filToETHPriceFeed;
    let btcToETHPriceFeed;
    let usdcToETHPriceFeed;

    let lendingMarkets = [];
    let btcLendingMarkets = [];
    let usdcLendingMarkets = [];
    let marketOrder;

    let aliceOrdersSum = 0;
    let bobOrdersSum = 0;
    let carolOrdersSum = 0;

    let aliceInitialCollateral = web3.utils.toBN("10000000000000000000");
    let aliceCurrentCollateral = web3.utils.toBN("0");
    let bobInitialCollateral = web3.utils.toBN("15000000000000000000");
    let bobCurrentCollateral = web3.utils.toBN("0");
    let carolInitialCollateral = web3.utils.toBN("5000000000000000000");
    let carolCurrentCollateral = web3.utils.toBN("0");

    before('deploy contracts', async () => {
        loan = await Loan.new();

        collateral = await Collateral.new(loan.address);
        
        ratesAggregator = await FXRatesAggregator.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.FIL, web3.utils.toBN("67175250000000000"));
        setPriceFeedTx = await ratesAggregator.linkPriceFeed(Ccy.FIL, filToETHPriceFeed.address, true);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');
        
        await collateral.setRatesAggregatorAddr(ratesAggregator.address, {from: owner});
        await loan.setCollateralAddr(collateral.address, {from: owner});
        
        lendingController = await LendingMarketController.new();
        await loan.setLendingControllerAddr(lendingController.address, {from: owner});    
    });

    describe('Test functions with onlyOwner modifier', async () => {
        it('Try to link LendingMarket by Bob, expect revert', async () => {
            await expectRevert(
                loan.addLendingMarket(Ccy.FIL, Term._3m, "0x0000000000000000000000000000000000000000", {from: bob}), ""
            );
        });

        it('Try to allow loan ownership transfers by Bob, expect revert', async () => {
            await expectRevert(
                loan.setIsTransferable(true, {from: bob}), ""
            );
        });

        it('Try to rewrite Collateral address by Bob, expect revert', async () => {
            await expectRevert(
                loan.setCollateralAddr(collateral.address, {from: bob}), ""
            );
        });

        it('Try to set FXRatesAggregator with zero address by Owner, expect revert', async () => {
            await expectRevert(
                loan.setLendingControllerAddr(lendingController.address, {from: bob}), ""
            );
        });
    });

    describe('Prepare markets and users for lending deals', async () => {
        it('Deploy Lending Markets with each Term for FIL market', async () => {
            for (i=0; i < 6; i++) {
                let market = await lendingController.deployLendingMarket(Ccy.FIL, i, {from: owner});
                await emitted(market, "LendingMarketCreated");
                lendingMarkets.push(market.logs[0].args.marketAddr);

                let lendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr);
                await lendingMarket.setCollateral(collateral.address, {from: owner});
                await lendingMarket.setLoan(loan.address, {from: owner});

                await collateral.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
                await loan.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
                // console.log("Lending Market CCY: Ccy.FIL")
                // console.log("Lending Market Term: " + i)
                // console.log("Lending Market Address: " + lendingMarket.address)
                // console.log()
            }
        });
        it('Register collateral book for Alice with 10 ETH and check Alice collateral book', async () => {
            let result = await collateral.register("Alice", "f0152351", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4", {from: alice, value: aliceInitialCollateral});
            await emitted(result, 'Register');

            const book = await collateral.getOneBook(alice);
            book.id.should.be.equal('Alice');
            book.userAddrFIL.should.be.equal(web3.utils.utf8ToHex("f0152351"));
            book.userAddrBTC.should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4"));
            book.colAmtETH.should.be.equal(aliceInitialCollateral.toString());
            book.totalUsedETH.should.be.equal('0');
            book.totalUsedFIL.should.be.equal('0');
            book.totalUsedUSDC.should.be.equal('0');
            book.totalUsedBTC.should.be.equal('0');
            book.isAvailable.should.be.equal(true);
            book.state.should.be.equal(String(ColState.AVAILABLE));
        });

        it('Register collateral book for Bob with 15 ETH and check Bob collateral book', async () => {
            let result = await collateral.register("Bob", "f0152352", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY5", {from: bob, value: bobInitialCollateral});
            await emitted(result, 'Register');

            const book = await collateral.getOneBook(bob);
            book.id.should.be.equal('Bob');
            book.userAddrFIL.should.be.equal(web3.utils.utf8ToHex("f0152352"));
            book.userAddrBTC.should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY5"));
            book.colAmtETH.should.be.equal(bobInitialCollateral.toString());
            book.totalUsedETH.should.be.equal('0');
            book.totalUsedFIL.should.be.equal('0');
            book.totalUsedUSDC.should.be.equal('0');
            book.totalUsedBTC.should.be.equal('0');
            book.isAvailable.should.be.equal(true);
            book.state.should.be.equal(String(ColState.AVAILABLE));
        });

        it('Register collateral book for Carol with 5 ETH and check Carol collateral book', async () => {
            let result = await collateral.register("Carol", "f0152353", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY6", {from: carol, value: carolInitialCollateral});
            await emitted(result, 'Register');

            const book = await collateral.getOneBook(carol);
            book.id.should.be.equal('Carol');
            book.userAddrFIL.should.be.equal(web3.utils.utf8ToHex("f0152353"));
            book.userAddrBTC.should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY6"));
            book.colAmtETH.should.be.equal(carolInitialCollateral.toString());
            book.totalUsedETH.should.be.equal('0');
            book.totalUsedFIL.should.be.equal('0');
            book.totalUsedUSDC.should.be.equal('0');
            book.totalUsedBTC.should.be.equal('0');
            book.isAvailable.should.be.equal(true);
            book.state.should.be.equal(String(ColState.AVAILABLE));
        });

        it('Make lend orders by Alice', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 10000, 900, {from: alice});
            aliceOrdersSum = aliceOrdersSum + 10000;
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 11000, 1000, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 11000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 12000, 1100, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 12000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 13000, 1200, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 13000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 14000, 1300, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 14000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 15000, 1500, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 15000;
        });
        it('Make borrow orders by Alice', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 10000, 700, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 10000;

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 11000, 800, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 11000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 12000, 900, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 12000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 13000, 1000, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 13000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 14000, 1100, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 14000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 15000, 1300, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            aliceOrdersSum = aliceOrdersSum + 15000;
        });

        it('Make lend orders by Bob', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 20000, 910, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 20000;

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 21000, 1010, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 21000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 22000, 1110, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 22000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 23000, 1210, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 23000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 24000, 1310, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 24000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 25000, 1510, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 25000;
        });
        it('Make borrow orders by Bob', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 20000, 690, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 20000;

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 21000, 790, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 21000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 22000, 890, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 22000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 23000, 990, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 23000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 24000, 1090, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 24000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 25000, 1290, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            bobOrdersSum = bobOrdersSum + 25000;
        });

        it('Make lend orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 30000, 920, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 30000;

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 31000, 1020, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 31000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 32000, 1120, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 32000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 33000, 1220, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 33000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 34000, 1320, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 34000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 35000, 1520, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 35000;
        });
        it('Make borrow orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 30000, 680, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 30000;

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 31000, 780, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 31000;

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 32000, 880, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 32000;

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 33000, 980, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 33000;

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 34000, 1080, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 34000;

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 35000, 1280, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + 35000;
        });

        it('Check collateral usage for Alice, Bob and Carol collateral books', async () => {
            const aliceBook = await collateral.getOneBook(alice);
            aliceBook.totalUsedFIL.should.be.equal((aliceOrdersSum*(2/10)).toString());
            aliceBook.state.should.be.equal(String(ColState.IN_USE));
        
            const bobBook = await collateral.getOneBook(bob);
            bobBook.totalUsedFIL.should.be.equal((bobOrdersSum*(2/10)).toString());
            bobBook.state.should.be.equal(String(ColState.IN_USE));

            const carolBook = await collateral.getOneBook(carol);
            carolBook.totalUsedFIL.should.be.equal((carolOrdersSum*(2/10)).toString());
            carolBook.state.should.be.equal(String(ColState.IN_USE));
        });
    });

    describe('Register Loan between Alice and Carol and test settlement failure', async () => {
        let lender = alice; // FIL lender
        let borrower = carol; // FIL borrower
        let loanId = 1; // first loan in loan contract
        let amount = 10000;
        let rate = 1500;
        let coupon = ((amount * rate) / 10000);
        let emptyString = "0x0000000000000000000000000000000000000000000000000000000000000000";
        let zeroAddr = "0x0000000000000000000000000000000000000000";

        before(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
    
        after(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        it('Register 5 year FIL loan deal with 15% interest rate between Alice and Carol', async () => {
            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, amount, rate, {from: carol});
            await emitted(marketOrder, 'TakeOrder');
        });
        it('Check Loan Deal and Loan Schedule data', async ()=> {
            const currentTime = await getLatestTimestamp();

            const loanDeal = await loan.getLoanItem(loanId);
            loanDeal.lender.should.be.equal(lender);
            loanDeal.borrower.should.be.equal(borrower);
            loanDeal.ccy.should.be.equal(Ccy.FIL.toString());
            loanDeal.term.should.be.equal(Term._5y.toString());
            loanDeal.amt.should.be.equal(amount.toString());
            loanDeal.rate.should.be.equal(rate.toString());
            loanDeal.start.should.be.equal(currentTime.toString());
            loanDeal.end.should.be.equal((currentTime + (5 * ONE_YEAR)).toString());
            loanDeal.pv.should.be.equal(amount.toString());
            loanDeal.asOf.should.be.equal(currentTime.toString());
            loanDeal.isAvailable.should.be.equal(true);
            loanDeal.state.should.be.equal(LoanState.REGISTERED.toString());
            loanDeal.terminationAsked.should.be.equal(false);
            loanDeal.terminationAsker.should.be.equal(zeroAddr);
            loanDeal.startTxHash.should.be.equal(emptyString);

            const schedule = await loan.getSchedule(loanId);
            schedule.notices[0].should.be.equal((currentTime + ONE_YEAR - NOTICE_GAP).toString());
            schedule.notices[1].should.be.equal((currentTime + (2 * ONE_YEAR) - NOTICE_GAP).toString());
            schedule.notices[2].should.be.equal((currentTime + (3 * ONE_YEAR) - NOTICE_GAP).toString());
            schedule.notices[3].should.be.equal((currentTime + (4 * ONE_YEAR) - NOTICE_GAP).toString());
            schedule.notices[4].should.be.equal((currentTime + (5 * ONE_YEAR) - NOTICE_GAP).toString());

            schedule.payments[0].should.be.equal((currentTime + ONE_YEAR).toString());
            schedule.payments[1].should.be.equal((currentTime + (2 * ONE_YEAR)).toString());
            schedule.payments[2].should.be.equal((currentTime + (3 * ONE_YEAR)).toString());
            schedule.payments[3].should.be.equal((currentTime + (4 * ONE_YEAR)).toString());
            schedule.payments[4].should.be.equal((currentTime + (5 * ONE_YEAR)).toString());

            schedule.amounts[0].should.be.equal(coupon.toString());
            schedule.amounts[1].should.be.equal(coupon.toString());
            schedule.amounts[2].should.be.equal(coupon.toString());
            schedule.amounts[3].should.be.equal(coupon.toString());
            schedule.amounts[4].should.be.equal((amount + coupon).toString());

            schedule.isDone[0].should.be.equal(false);
            schedule.isDone[1].should.be.equal(false);
            schedule.isDone[2].should.be.equal(false);
            schedule.isDone[3].should.be.equal(false);
            schedule.isDone[4].should.be.equal(false);

            schedule.txHash[0].should.be.equal(emptyString);
            schedule.txHash[1].should.be.equal(emptyString);
            schedule.txHash[2].should.be.equal(emptyString);
            schedule.txHash[3].should.be.equal(emptyString);
            schedule.txHash[4].should.be.equal(emptyString);
        });

        it("Check Alice and Carol collateral books", async () => {
            const aliceBook = await collateral.getOneBook(alice);
            aliceBook.totalUsedFIL.should.be.equal((aliceOrdersSum*(2/10)).toString());

            const carolBook = await collateral.getOneBook(carol);
            carolBook.totalUsedFIL.should.be.equal(((carolOrdersSum*(2/10))+amount).toString());
        });

        it("Expect CLOSED state after loan settlement failure by lender", async () => {
            // Alice failed to lend out FIL within settlement period
            await advanceTimeAndBlock(SETTLE_GAP + ONE_MINUTE);
            res = await loan.markToMarket(loanId);
            await expectEvent(res, 'UpdateState', {
                loanId: String(loanId),
                prevState: String(LoanState.REGISTERED),
                currState: String(LoanState.CLOSED),
            });
        });

        it('Expect revert on notifying loan from Alice after closing Loan deal', async () => {
            const txHash = '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238';
            await expectRevert(
                loan.notifyPayment(amount, loanId, txHash, {from: alice}),
                'loan is not active',
            );

            await expectRevert(
                loan.confirmPayment(amount, loanId, txHash, {from: carol}),
                'loan is not active',
            );
        });
    });

    describe('Test 5 year FIL loan between Alice and Carol with succesfull settlement', async () => {
        let lender = alice; // FIL lender
        let borrower = carol; // FIL borrower
        let loanId = 1; // first loan in loan contract
        let amount = 10000;
        let rate = 1500;
        let coupon = ((amount * rate) / 10000);
        const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');

        before(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
    
        after(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        it('Register 5 year FIL loan deal with 15% interest rate between Alice and Carol', async () => {
            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, amount, rate, {from: borrower});
            await emitted(marketOrder, 'TakeOrder');
        });

        it('Expect revert on payment notification and confirmation by wrong amount and wrong party', async () => {
            await expectRevert(
                loan.notifyPayment(loanId, 5000, txHash, {from: borrower}),
                "lender must notify",
            );
            await expectRevert(
                loan.notifyPayment(loanId, 5000, txHash, {from: lender}),
                "amount don't match",
            );
            await expectRevert(
                loan.confirmPayment(loanId, amount, txHash, {from: borrower}),
                "txhash not match",
            );
            await expectRevert(
                loan.confirmPayment(loanId, amount, txHash, {from: lender}),
                "borrower must confirm",
            );
        });

        it('Succesfully notify payment by Alice for 10000 FIL', async () => {
            let notification = await loan.notifyPayment(loanId, amount, txHash, {from: lender});
            await emitted(notification, 'NotifyPayment');
            const deal = await loan.getLoanItem(loanId);
        });

        it('Succesfully confirm payment by Carol for 10000 FIL', async () => {
            let confirmation = await loan.confirmPayment(loanId, amount, txHash, {from: borrower});
            await emitted(confirmation, 'ConfirmPayment');
            
            aliceOrdersSum = aliceOrdersSum - amount
            const aliceBook = await collateral.getOneBook(alice);
            aliceBook.totalUsedFIL.should.be.equal((aliceOrdersSum*(2/10)).toString());

            // await advanceTimeAndBlock(364 * ONE_DAY);
            const dfs = await lendingController.getDiscountFactorsForCcy(Ccy.FIL);
            console.log(dfs);

            const pv = await loan.getCurrentPV(loanId);
            console.log("Present Value of loan: " + pv.toString());
            console.log();

            // const schedule = await loan.getSchedule(loanId);

            // const df = await loan.getDF(loanId, schedule.payments[0]);
            // console.log("DF: " + df.toString());
            // const df2 = await loan.getDF(loanId, schedule.payments[1]);
            // console.log("DF 2 : " + df2.toString());
            // const df3 = await loan.getDF(loanId, schedule.payments[2]);
            // console.log("DF 3 : " + df3.toString());
            // const df4 = await loan.getDF(loanId, schedule.payments[3]);
            // console.log("DF 4 : " + df4.toString());
            // const df5 = await loan.getDF(loanId, schedule.payments[4]);
            // console.log("DF 5 : " + df5.toString());
        });

        it('State transition WORKING -> DUE by shifting 6 month further', async () => {
            await advanceTimeAndBlock(ONE_YEAR/2);

            // no events will be emitted because loan still WORKING
            let tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            const loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.WORKING));

            await advanceTimeAndBlock(ONE_YEAR/2 - NOTICE_GAP + ONE_MINUTE);

            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            let state = await loan.getCurrentState(loanId, {from: lender});
            state.toNumber().should.be.equal(LoanState.DUE);
        });

        it("State transition DUE -> PAST_DUE -> WORKING by failing to pay coupon", async () => {
            let liquidationAmount = (coupon * (120 / 100));
            let liquidationInETH = await ratesAggregator.convertToETH(Ccy.FIL, liquidationAmount, {from: alice});

            aliceCurrentCollateral = aliceInitialCollateral.add(liquidationInETH)
            carolCurrentCollateral = carolInitialCollateral.sub(liquidationInETH)

            await advanceTimeAndBlock(NOTICE_GAP);
            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            const loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.PAST_DUE));

            const aliceBook = await collateral.getOneBook(alice);
            aliceBook.colAmtETH.should.be.equal(aliceCurrentCollateral.toString());

            const carolBook = await collateral.getOneBook(carol);
            carolBook.colAmtETH.should.be.equal(carolCurrentCollateral.toString());

            const schedule = await loan.getSchedule(loanId);
            schedule.isDone[0].should.be.equal(true);

            let state = await loan.getCurrentState(loanId, {from: lender});
            state.toNumber().should.be.equal(LoanState.WORKING);
        });

        it("State transition WORKING -> DUE -> WORKING by shifting 1 year further", async () => {
            await advanceTimeAndBlock(ONE_YEAR - NOTICE_GAP);
            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            const loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.DUE));

            // borrower notify coupon payment
            const couponTx = web3.utils.asciiToHex('bafy2bzacednk3rpqr7tm');
            let notification = await loan.notifyPayment(loanId, coupon, couponTx, {from: borrower});
            await emitted(notification, 'NotifyPayment');

            // lender confirm coupon receipt
            let res = await loan.confirmPayment(loanId, coupon, couponTx, {from: lender});
            await expectEvent(res, 'ConfirmPayment', {
                loanId: String(loanId),
                amt: String(coupon),
                txHash: couponTx.padEnd(66, '0'),
            });

            item = await loan.getLoanItem(loanId, {from: lender});
            expect(Number(item.state)).to.equal(LoanState.WORKING);

            const schedule = await loan.getSchedule(loanId);
            schedule.txHash[1].should.be.equal(couponTx.padEnd(66, '0'));
            schedule.isDone[1].should.be.equal(true);
        });

        it("State transition WORKING -> DUE -> WORKING -> DUE -> WORKING by shifting 1 and 2 years further", async () => {
            await advanceTimeAndBlock(ONE_YEAR);
            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            let loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.DUE));

            // borrower notify coupon payment
            const couponTx = web3.utils.asciiToHex('bafy2bzacednk3rpqr7tm');
            let notification = await loan.notifyPayment(loanId, coupon, couponTx, {from: borrower});
            await emitted(notification, 'NotifyPayment');

            // lender confirm coupon receipt
            let res = await loan.confirmPayment(loanId, coupon, couponTx, {from: lender});
            await expectEvent(res, 'ConfirmPayment', {
                loanId: String(loanId),
                amt: String(coupon),
                txHash: couponTx.padEnd(66, '0'),
            });

            item = await loan.getLoanItem(loanId, {from: lender});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
            
            let schedule = await loan.getSchedule(loanId);
            schedule.txHash[2].should.be.equal(couponTx.padEnd(66, '0'));
            schedule.isDone[2].should.be.equal(true);

            await advanceTimeAndBlock(ONE_YEAR);
            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.DUE));

            notification = await loan.notifyPayment(loanId, coupon, couponTx, {from: borrower});
            await emitted(notification, 'NotifyPayment');

            res = await loan.confirmPayment(loanId, coupon, couponTx, {from: lender});
            await expectEvent(res, 'ConfirmPayment', {
                loanId: String(loanId),
                amt: String(coupon),
                txHash: couponTx.padEnd(66, '0'),
            });

            item = await loan.getLoanItem(loanId, {from: lender});
            expect(Number(item.state)).to.equal(LoanState.WORKING);

            schedule = await loan.getSchedule(loanId);
            schedule.txHash[3].should.be.equal(couponTx.padEnd(66, '0'));
            schedule.isDone[3].should.be.equal(true);
        });

        it("Fail to pay back notional plus coupon amount on maturity date, state transition WORKING -> DUE -> PAST_DUE -> TERMINATED", async () => {
            let emptyString = "0x0000000000000000000000000000000000000000000000000000000000000000";

            let aliceBook = await collateral.getOneBook(alice);
            aliceBook.colAmtETH.should.be.equal(aliceCurrentCollateral.toString());

            let carolBook = await collateral.getOneBook(carol);
            carolBook.colAmtETH.should.be.equal(carolCurrentCollateral.toString());

            let liquidationAmount = ((amount + coupon) * (120 / 100));
            let liquidationInETH = await ratesAggregator.convertToETH(Ccy.FIL, liquidationAmount, {from: alice});

            aliceCurrentCollateral = aliceCurrentCollateral.add(liquidationInETH)
            carolCurrentCollateral = carolCurrentCollateral.sub(liquidationInETH)            

            await advanceTimeAndBlock(ONE_YEAR);
            tx = await loan.markToMarket(loanId, {from: lender});
            await emitted(tx, 'MarkToMarket');

            loanDeal = await loan.getLoanItem(loanId);
            loanDeal.state.should.be.equal(String(LoanState.DUE));

            await advanceTimeAndBlock(NOTICE_GAP);
            let state = await loan.getCurrentState(loanId, {from: lender});
            expect(Number(state)).to.equal(LoanState.PAST_DUE);

            tx = await loan.markToMarket(loanId, {from: lender});

            item = await loan.getLoanItem(loanId, {from: lender});
            expect(Number(item.state)).to.equal(LoanState.TERMINATED);

            schedule = await loan.getSchedule(loanId);
            schedule.txHash[4].should.be.equal(emptyString);
            schedule.isDone[4].should.be.equal(true);

            aliceBook = await collateral.getOneBook(alice);
            aliceBook.colAmtETH.should.be.equal(aliceCurrentCollateral.toString());

            carolBook = await collateral.getOneBook(carol);
            carolBook.colAmtETH.should.be.equal(carolCurrentCollateral.toString());
            carolBook.totalUsedFIL.should.be.equal((carolOrdersSum*(2/10)).toString());
        });
    });

    describe('Test 3 month FIL loan between Alice and Bob with early termination', async () => {
        let lender = alice; // FIL lender
        let borrower = bob; // FIL borrower
        let loanId = 1; // first loan in loan contract
        let amount = 10000;
        let rate = 900;
        let coupon = ((amount * (rate * 90 / 360)) / 10000);
        const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');

        before(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
    
        after(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        it('Register 3 month FIL loan deal with 9% interest rate between Alice and Bob', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, amount, rate, {from: borrower});
            await emitted(marketOrder, 'TakeOrder');
        });

        it('Check Loan Deal and Loan Schedule data', async ()=> {
            const currentTime = await getLatestTimestamp();

            const loanDeal = await loan.getLoanItem(loanId);
            loanDeal.lender.should.be.equal(lender);
            loanDeal.borrower.should.be.equal(borrower);
            loanDeal.ccy.should.be.equal(Ccy.FIL.toString());
            loanDeal.term.should.be.equal(Term._3m.toString());
            loanDeal.amt.should.be.equal(amount.toString());
            loanDeal.rate.should.be.equal(rate.toString());
            loanDeal.start.should.be.equal(currentTime.toString());
            loanDeal.end.should.be.equal((currentTime + (90 * ONE_DAY)).toString());
            loanDeal.pv.should.be.equal(amount.toString());
            loanDeal.asOf.should.be.equal(currentTime.toString());
            loanDeal.isAvailable.should.be.equal(true);
            loanDeal.state.should.be.equal(LoanState.REGISTERED.toString());

            const schedule = await loan.getSchedule(loanId);
            schedule.notices[0].should.be.equal((currentTime + (90 * ONE_DAY) - NOTICE_GAP).toString());
            schedule.payments[0].should.be.equal((currentTime + (90 * ONE_DAY)).toString());
            schedule.amounts[0].should.be.equal((amount + coupon).toString());
        });

        it('Check present value of 3 month loan', async () => {
            rate = await lendingController.getDiscountFactorsForCcy(Ccy.FIL, {from: bob});
            console.log("df3m: " + rate[0]);
            console.log("df6m: " + rate[1]);
            console.log("df1y: " + rate[2]);
            console.log("df2y: " + rate[3]);
            console.log("df3y: " + rate[4]);
            console.log("df4y: " + rate[5]);
            console.log("df5y: " + rate[6]);
            console.log();

            const pv = await loan.getCurrentPV(loanId);
            console.log(pv.toString());

            const schedule = await loan.getSchedule(loanId);

            const df = await loan.getDF(loanId, schedule.payments[0]);
            console.log("DF: " + df.toString());
            console.log();

        });

        it("Check Alice and Bob collateral books", async () => {
            const aliceBook = await collateral.getOneBook(alice);
            aliceOrdersSum = aliceOrdersSum + 10000
            aliceBook.totalUsedFIL.should.be.equal((aliceOrdersSum*(2/10)).toString());

            const bobBook = await collateral.getOneBook(bob);
            bobBook.totalUsedFIL.should.be.equal(((bobOrdersSum*(2/10))+amount).toString());
        });

        it('Succesfully notify payment by Alice for 10000 FIL', async () => {
            let notification = await loan.notifyPayment(loanId, amount, txHash, {from: lender});
            await emitted(notification, 'NotifyPayment');
        });

        it('Succesfully confirm payment by Bob for 10000 FIL', async () => {
            let confirmation = await loan.confirmPayment(loanId, amount, txHash, {from: borrower});
            await emitted(confirmation, 'ConfirmPayment');

            const deal = await loan.getLoanItem(loanId);
            deal.state.should.be.equal(LoanState.WORKING.toString());

            aliceOrdersSum = aliceOrdersSum - amount
            const aliceBook = await collateral.getOneBook(alice);
            aliceBook.totalUsedFIL.should.be.equal((aliceOrdersSum*(2/10)).toString());
        });

        it('Request early termination by Bob 1 month later', async () => {
            await advanceTimeAndBlock(60 * ONE_DAY);

            const pv = await loan.getCurrentPV(loanId);
            console.log(pv.toString());

            const schedule = await loan.getSchedule(loanId);

            const df = await loan.getDF(loanId, schedule.payments[0]);
            console.log("DF: " + df.toString());

            let request = await loan.requestTermination(loanId, {from: borrower});
            await emitted(request, 'RequestTermination');

            const deal = await loan.getLoanItem(loanId);
            deal.state.should.be.equal(LoanState.WORKING.toString());
        });

        it('Accept early termination by Bob 1 month later', async () => {
            const conversionBase = web3.utils.toBN('1000000000000000000');
            let secondsPerYear = web3.utils.toBN('86400').mul(web3.utils.toBN('365'));
            let interest = web3.utils.toBN('900').mul(conversionBase).div(secondsPerYear);

            let deal = await loan.getLoanItem(loanId);
            const pv = await loan.getCurrentPV(loanId);

            let currentTime = await getLatestTimestamp()
            let timeDelta = web3.utils.toBN(currentTime.toString()).sub(web3.utils.toBN(deal.start.toString()));
            let accuredInterest = interest.mul(timeDelta).div(conversionBase);
            let totalPayment = accuredInterest.add(web3.utils.toBN(pv));

            console.log("Time delta: " + timeDelta);
            console.log("Interest per second: " + interest);
            console.log("Accured interest: " + accuredInterest);
            console.log("Total payment: " + totalPayment);

            let tx = await loan.acceptTermination(loanId, {from: lender});
            await expectEvent(tx, 'EarlyTermination', {
                loanId: String(loanId),
                acceptedBy: String(lender),
                payment: totalPayment.toString(),
            });

            deal = await loan.getLoanItem(loanId);
            deal.state.should.be.equal(LoanState.TERMINATED.toString());
        });
    });

    // describe('Margin Call State Transition Test', async () => {
    //     beforeEach(async () => {
    //         const snapShot = await takeSnapshot();
    //         snapshotId = snapShot['result'];
    //     });
    //     afterEach(async () => {
    //         await revertToSnapshot(snapshotId);
    //     });
    
    //     let maker = alice; // FIL lender
    //     let taker = carol; // FIL borrower
    
    //     it('Collateral State transition IN_USE -> MARGINCALL -> LIQUIDATION', async () => {
    //         await printCol(collateral, taker, 'BEFORE PV drop');
        
    //         let book, amtWithdraw;
    //         book = await collateral.getOneBook(taker);
    //         amtWithdraw = book.colAmtETH - Math.round((150 * book.colAmtETH) / book.coverage);
        
    //         // console.log('book is', book);
    //         // console.log('amtWithdraw is', amtWithdraw);
        
    //         await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
    //         await printCol(collateral, taker, 'PV drop to 150');
        
    //         book = await collateral.getOneBook(taker);
    //         expect(Number(book.state)).to.equal(ColState.MARGIN_CALL);
        
    //         book = await collateral.getOneBook(taker);
    //         amtWithdraw = book.colAmtETH - Math.round((125 * book.colAmtETH) / book.coverage);
    //         await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
    //         await printCol(collateral, taker, 'PV drop to 125');
    //     });
    
    //     it('Collateral State change by FX IN_USE -> MARGINCALL -> LIQUIDATION -> AVAILABLE', async () => {
    //         let loanId = 0;
    //         let item, res, midRates;
        
    //         await printCol(collateral, taker, 'BEFORE PV drop');
    //         midRates = await fxMarket.getMidRates();
    //         console.log('FX midRates is', midRates.join(' '), '\n');
        
    //         let book, amtWithdraw;
    //         book = await collateral.getOneBook(taker);
    //         amtWithdraw = book.colAmtETH - Math.round((160 * book.colAmtETH) / book.coverage);
    //         await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
    //         await printCol(collateral, taker, 'PV drop to 160');
        
    //         book = await collateral.getOneBook(taker);
    //         expect(Number(book.state)).to.equal(ColState.IN_USE);
        
    //         // col state IN_USE -> MARGINCALL
    //         item = {
    //             pair: CcyPair.FILETH,
    //             offerInput: [Ccy.ETH, Ccy.FIL, 8900, 100000],
    //             bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8700],
    //             effectiveSec: 36000,
    //         };
    //         res = await fxMarket.setFXBook(...val(item), {from: alice});
    //         expectEvent(res, 'SetFXBook', {addr: alice});
        
    //         midRates = await fxMarket.getMidRates();
    //         console.log('FX midRates is', midRates.join(' '), '\n');
    //         await loan.updateBookPV(maker);
    //         // await collateral.updateState(taker);
    //         await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 82 to 88`);
        
    //         // col state MARGINCALL -> LIQUIDATION
    //         item = {
    //             pair: CcyPair.FILETH,
    //             offerInput: [Ccy.ETH, Ccy.FIL, 10600, 100000],
    //             bidInput: [Ccy.FIL, Ccy.ETH, 100000, 10400],
    //             effectiveSec: 36000,
    //         };
    //         res = await fxMarket.setFXBook(...val(item), {from: alice});
    //         expectEvent(res, 'SetFXBook', {addr: alice});
        
    //         midRates = await fxMarket.getMidRates();
    //         console.log('FX midRates is', midRates.join(' '), '\n');
    //         await loan.updateBookPV(maker);
    //         // await collateral.updateState(taker);
    //         await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 88 to 105`);
        
    //         // loan state WORKING -> TERMINATED
    //         // coll state LIQUIDATION -> LIQUIDATION_IN_PROGRESS
    //         await loan.updateState(maker, taker, loanId);
    //         await printState(loan, collateral, maker, taker, loanId, `BEFORE liquidation ${await getDate()}`);
        
    //         // coll state LIQUIDATION_IN_PROGRESS -> AVAILABLE or EMPTY
    //         await loan.updateState(maker, taker, loanId);
    //         await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
        
    //         item = await loan.getLoanItem(loanId, {from: maker});
    //         expect(Number(item.state)).to.equal(LoanState.TERMINATED);
    //     });
    // });

    // describe('PV Calculation Test', async () => {
    //     beforeEach(async () => {
    //       const snapShot = await takeSnapshot();
    //       snapshotId = snapShot['result'];
    //     });
    //     afterEach(async () => {
    //       await revertToSnapshot(snapshotId);
    //     });
    
    //     let maker = alice; // FIL lender
    //     let taker = carol; // FIL borrower
    
    //     it('Check PV calculation made correctly', async () => {
    //       let loanId = 0;
    
    //       let DF = await lendingController.getDiscountFactorsForCcy(Ccy.FIL, {from: bob});
    //       let [df3m, df6m, df1y, df2y, df3y, df4y, df5y] = DF;
    //       console.log(df1y, df2y, df3y, df4y, df5y);
    
    //       // check if pv is correct
    //       item = await loan.getLoanItem(loanId, {from: maker});
    //       console.log('BEFORE MtM', item.pv, toDate(item.asOf));
    //       let [cf1, cf2, cf3, cf4, cf5] = item.schedule.amounts;
    
    //       // Manual check for pv
    //       let BP = 10000;
    //       let coupon = (item.rate * item.amt) / BP;
    //       let notional = item.amt;
    //       let pv = (cf1 * df1y + cf2 * df2y + cf3 * df3y + cf4 * df4y + cf5 * df5y) / BP;
    
    //       // await loan.updateAllPV();
    //       await loan.updateBookPV(maker);
    //       item = await loan.getLoanItem(loanId, {from: maker});
    //       console.log('AFTER MtM', item.pv, toDate(item.asOf));
    //       expect(Number(item.pv)).to.equal(Math.floor(pv));
    //     });
    
    //     it('Update PV by Yield Change', async () => {
    //       let loanId = 0;
    
    //       const pvUpdateAll = await loan.updateAllPV();
    //       console.log(`GasUsed: ${pvUpdateAll.receipt.gasUsed}`)
    
    //       const pvUpdate0 = await loan.updateBookPV(maker);
    
    //       let item = await loan.getLoanItem(loanId, {from: maker});
    //       console.log('BEFORE Yield Change', item.pv, toDate(item.asOf));
    //       let pv1 = item.pv;

    //       let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
    //       marketOrder = await _5yMarket.order(1, 15000, 1600, {from: alice});
    //       await emitted(marketOrder, 'MakeOrder');

    //       const pvUpdate1 = await loan.updateBookPV(maker);
    //       console.log(`GasUsed: ${pvUpdate1.receipt.gasUsed}`)
    
    //       item = await loan.getLoanItem(loanId, {from: maker});
    //       console.log('AFTER  Yield Change', item.pv, toDate(item.asOf));
    //       let pv2 = item.pv;
    
    //       expect(Number(pv1)).not.to.equal(Number(pv2));
    //     });
    //   });    
});