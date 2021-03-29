const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const Loan = artifacts.require('Loan');

const {Side, Ccy, CcyPair, Term, ColState, sample, LoanState} = require('../test-utils').constants;
const {accounts, defaultSender, web3, provider} = require("@openzeppelin/test-environment");
const { toDate, printCol, printLoan, printState, printSched, } = require('../test-utils/src/helper');
const { ONE_MINUTE, ONE_DAY, ONE_YEAR, NOTICE_GAP, SETTLE_GAP, advanceTimeAndBlock, takeSnapshot, revertToSnapshot, getLatestTimestamp, } = require('../test-utils').time;
const { emitted, reverted, equal, notEqual, } = require('../test-utils').assert;
const { orders } = require("./orders");

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

const effectiveSec = 60 * 60 * 24 * 14; // 14 days

const expectRevert = reverted;

contract('Loan', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    const users = [alice, bob, carol]; // without owner
    
    let snapshotId;
    let fxMarket;
    let collateral;
    let loan;
    let lendingController;
    let lendingMarkets = [];
    let orderList;
    let marketOrder;

    before('deploy contracts', async () => {
        orderList = orders;
        lendingController = await LendingMarketController.new();

        fxMarket = await FXMarket.new();
        loan = await Loan.new();
        collateral = await Collateral.new(loan.address);
        await collateral.setFxMarketAddr(fxMarket.address, {from: owner});
        await loan.setLendingControllerAddr(lendingController.address, {from: owner});
        await loan.setCollateralAddr(collateral.address, {from: owner});
    });

    describe('Setup Test Data', async () => {
        it('Init Collateral with sample data', async () => {
            sample.Collateral.forEach(async (item, index) => {
                let res = await collateral.setColBook(...val(item), {
                from: users[index],
                // value: 0,
                value: 100000,
                });
                await emitted(res, 'SetColBook');
            });
        });
        it('Init with sample FXMarket', async () => {
            sample.FXMarket.forEach(async (item) => {
                let res = await fxMarket.setFXBook(...val(item), {from: alice});
                await emitted(res, 'SetFXBook');
            });
        });
        it('deploy Lending Markets with each Term for FIL market', async () => {
            for (i=0; i < 6; i++) {
                let market = await lendingController.deployLendingMarket(Ccy.FIL, i, {from: owner});
                lendingMarkets.push(market.logs[0].args.marketAddr);

                let lendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr);
                await lendingMarket.setCollateral(collateral.address, {from: owner});
                await lendingMarket.setLoan(loan.address, {from: owner});

                await collateral.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
                await loan.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
            }
        });
        it('Create new lend market orders by Alice', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 10000, 900, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 11000, 1000, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 12000, 1100, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 13000, 1200, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 14000, 1300, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 15000, 1500, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });
        it('Create new borrow market orders by Alice', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 10000, 700, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 11000, 800, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 12000, 900, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 13000, 1000, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 14000, 1100, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 15000, 1300, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Create new lend market orders by Bob', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 20000, 910, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 21000, 1010, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 22000, 1110, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 23000, 1210, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 24000, 1310, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 25000, 1510, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
        });
        it('Create new borrow market orders by Bob', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 20000, 690, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 21000, 790, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 22000, 890, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 23000, 990, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 24000, 1090, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 25000, 1290, effectiveSec, {from: bob});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Create new lend market orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, 30000, 920, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, 31000, 1020, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, 32000, 1120, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, 33000, 1220, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, 34000, 1320, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, 35000, 1520, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
        });
        it('Create new borrow market orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, 30000, 680, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            
            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, 31000, 780, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, 32000, 880, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, 33000, 980, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, 34000, 1080, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 35000, 1280, effectiveSec, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Init FIL custody addr', async () => {
            let res0 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_0'), users[0]);
            let res1 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_1'), users[1]);
            let res2 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_2'), users[2]);
            await expectEvent(res0, 'RegisterFILCustodyAddr', {addr: users[0]});
            await expectEvent(res1, 'RegisterFILCustodyAddr', {addr: users[1]});
            await expectEvent(res2, 'RegisterFILCustodyAddr', {addr: users[2]});
          });      
    });

    describe('Loan Settlement Failure Test', async () => {
        before(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
    
        after(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        it('FIL Loan initial settlement failure', async () => {
            let maker = alice; // FIL lender
            let taker = carol; // FIL borrower
            let item, loanId;
            item = sample.Loan[0];

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 10000, 1500, effectiveSec, {from: carol});
            await emitted(marketOrder, 'TakeOrder');

            loanId = 0; // available from event
            await printLoan(loan, maker, loanId, '[before settlement] loan');
            await printCol(collateral, maker, '[before settlement] maker collateral');
            await printCol(collateral, taker, '[before settlement] taker collateral');
        
            // fail to lend within settlement period
            await advanceTimeAndBlock(SETTLE_GAP + ONE_MINUTE);
            res = await loan.updateState(maker, taker, loanId);
            await expectEvent(res, 'UpdateState', {
                lender: maker,
                borrower: taker,
                loanId: String(loanId),
                prevState: String(LoanState.REGISTERED),
                currState: String(LoanState.CLOSED),
            });
        
            // lender - notifyPayment with txHash, but cannot
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
            await expectRevert(
                loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker}),
                'No need to notify now',
            );
    
          // borrower -> confirmPayment to ensure finality, but cannot
            await expectRevert(
                loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker}),
                'No need to confirm now',
            );
                
            await printLoan(loan, maker, loanId, '[after settlement] loan');
            await printCol(collateral, maker, '[after settlement] maker collateral');
            await printCol(collateral, taker, '[after settlement] taker collateral');
        });
    });

    describe('Loan Test', async () => {
        it('FIL Loan Execution', async () => {
            let maker = alice; // FIL lender
            let taker = carol; // FIL borrower
            let item, loanId, deal;
        
            item = sample.Loan[0];
            deal = [maker, ...val(item)]; // maker is FIL lender
        
            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, 10000, 1500, effectiveSec, {from: carol});
            await emitted(marketOrder, 'TakeOrder');

            loanId = 0; // available from event
            await printState(loan, collateral, maker, taker, loanId, '[makeLoanDeal]');
            console.log('deal item is', item);

            // lender - notifyPayment with txHash
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
            await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker});

            // borrower check -> confirmPayment to ensure finality
            await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker});
            await printState(loan, collateral, maker, taker, loanId, '[confirmPayment]');
            await printSched(loan, maker, loanId);
        });
        
        it('Check Lender Book for loans', async () => {
            const lenderBook = await loan.getLenderBook(alice);
            expect(lenderBook.loans[0].lender).to.equal(alice);
            expect(lenderBook.loans[0].borrower).to.equal(carol);
        });
    });

    // Loan deal is taken
    describe('Coupon Time Dependency Test', async () => {
        let maker = alice; // FIL lender
        let taker = carol; // FIL borrower

        beforeEach(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });

        afterEach(async () => {
            await revertToSnapshot(snapshotId);
        });

        it('State transition WORKING -> DUE -> PAST_DUE', async () => {
            let loanId = 0; // available from event

            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);

            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);

            // loan state DUE -> PAST_DUE
            await advanceTimeAndBlock(NOTICE_GAP);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.PAST_DUE);
        });

        it('State transition WORKING -> DUE -> WORKING', async () => {
            let loanId = 0; // available from event

            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);

            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);

            const couponAmt = item.schedule.amounts[0];
            const {side, ccy, term, amt} = sample.Loan[0];

            // borrower notify coupon payment
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
            await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});

            // lender confirm coupon receipt
            let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});

            await expectEvent(res, 'ConfirmPayment', {
                lender: maker,
                borrower: taker,
                side: String(item.side),
                ccy: String(item.ccy),
                term: String(item.term),
                amt: String(couponAmt),
                loanId: String(loanId),
                txHash: txHash.padEnd(66, '0'),
            });

            // loan state DUE -> WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        });

        it('State transition WORKING -> DUE -> PAST_DUE -> WORKING', async () => {
            let loanId = 0; // available from event

            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);

            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);

            // loan state DUE -> PAST_DUE
            await advanceTimeAndBlock(NOTICE_GAP);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.PAST_DUE);

            // loan state PAST_DUE -> WORKING
            await loan.updateState(maker, taker, loanId, {from: taker});
            await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        });
    });


    describe('Redemption Time Dependency Test', async () => {
        let maker = alice; // FIL lender
        let taker = carol; // FIL borrower
    
        beforeEach(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
    
        afterEach(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        it('State transition WORKING -> DUE -> PAST_DUE', async () => {
            let loanId = 0; // available from event
        
            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        
            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);
        
            // loan state DUE -> PAST_DUE
            await advanceTimeAndBlock(NOTICE_GAP);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.PAST_DUE);
        });
    
        it('State transition WORKING -> DUE -> WORKING', async () => {
            let loanId = 0; // available from event
        
            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        
            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);
        
            const couponAmt = item.schedule.amounts[0];
            const {side, ccy, term, amt} = sample.Loan[0];
        
            // borrower notify coupon payment
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
            await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
        
            // lender confirm coupon receipt
            let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
        
            await expectEvent(res, 'ConfirmPayment', {
                lender: maker,
                borrower: taker,
                side: String(item.side),
                ccy: String(item.ccy),
                term: String(item.term),
                amt: String(couponAmt),
                loanId: String(loanId),
                txHash: txHash.padEnd(66, '0'),
            });
        
            // loan state DUE -> WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        });
    
        it('State transition WORKING -> DUE -> PAST_DUE -> WORKING', async () => {
            let loanId = 0; // available from event
        
            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        
            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);
        
            // loan state DUE -> PAST_DUE
            await advanceTimeAndBlock(NOTICE_GAP);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.PAST_DUE);
        
            // loan state PAST_DUE -> WORKING
            await loan.updateState(maker, taker, loanId, {from: taker});
            await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        });
    
        it('Redemption State transition WORKING -> DUE -> WORKING -> DUE -> WORKING', async () => {
            let loanId = 0;
        
            // loan state WORKING
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
            let item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        
            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.DUE);
        
            const couponAmt = item.schedule.amounts[0];
            const {side, ccy, term, amt} = sample.Loan[0];
        
            // loan state DUE -> WORKING
            // borrower notify coupon payment
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
            await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
        
            // lender confirm coupon receipt
            let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
            await expectEvent(res, 'ConfirmPayment', {
                lender: maker,
                borrower: taker,
                side: String(item.side),
                ccy: String(item.ccy),
                term: String(item.term),
                amt: String(couponAmt),
                loanId: String(loanId),
                txHash: txHash.padEnd(66, '0'),
            });
        
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        
            // loan state WORKING -> DUE
            await advanceTimeAndBlock(ONE_YEAR);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
        
            // loan state DUE -> WORKING
            await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
            res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
            await expectEvent(res, 'ConfirmPayment', {
                lender: maker,
                borrower: taker,
                side: String(item.side),
                ccy: String(item.ccy),
                term: String(item.term),
                amt: String(couponAmt),
                loanId: String(loanId),
                txHash: txHash.padEnd(66, '0'),
            });
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.WORKING);
        });
    
        it('Redemption State transition WORKING -> DUE -> PAST_DUE -> CLOSED', async () => {
            let loanId = 0;
        
            let item = await loan.getLoanItem(loanId, {from: maker});
            const {side, ccy, term} = sample.Loan[0]; // get basic condition
            const paynums = [1, 1, 1, 2, 3, 5];
            const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
        
            // TODO - test for short time
            if (term == Term._3m || term == Term._6m) return;
        
            // loan state WORKING -> DUE
            await printState(loan, collateral, maker, taker, loanId, `BEFORE due ${await getDate()}`);
            await advanceTimeAndBlock(ONE_YEAR + SETTLE_GAP - NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
        
            // iter coupon payments until redeption
            for (i = 0; i < paynums[term] - 1; i++) {
                const couponAmt = item.schedule.amounts[i];
                // loan state DUE -> WORKING
                await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
                await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
                // loan state WORKING -> DUE
                await advanceTimeAndBlock(ONE_YEAR);
                await loan.updateState(maker, taker, loanId);
            }
        
            // loan state DUE -> PAST_DUE
            await printState(loan, collateral, maker, taker, loanId, `AFTER due ${await getDate()}`);
            await advanceTimeAndBlock(NOTICE_GAP + ONE_MINUTE);
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.PAST_DUE);
        
            // loan state PAST_DUE -> CLOSED
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.CLOSED);
        
            // item = await loan.getLoanItem(loanId, {from: maker});
            // console.log("item is", item);
        });
    });

    describe('Margin Call State Transition Test', async () => {
        beforeEach(async () => {
            const snapShot = await takeSnapshot();
            snapshotId = snapShot['result'];
        });
        afterEach(async () => {
            await revertToSnapshot(snapshotId);
        });
    
        let maker = alice; // FIL lender
        let taker = carol; // FIL borrower
    
        it('Collateral State transition IN_USE -> MARGINCALL -> LIQUIDATION', async () => {
            await printCol(collateral, taker, 'BEFORE PV drop');
        
            let book, amtWithdraw;
            book = await collateral.getOneBook(taker);
            amtWithdraw = book.colAmtETH - Math.round((150 * book.colAmtETH) / book.coverage);
        
            // console.log('book is', book);
            // console.log('amtWithdraw is', amtWithdraw);
        
            await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
            await printCol(collateral, taker, 'PV drop to 150');
        
            book = await collateral.getOneBook(taker);
            expect(Number(book.state)).to.equal(ColState.MARGIN_CALL);
        
            book = await collateral.getOneBook(taker);
            amtWithdraw = book.colAmtETH - Math.round((125 * book.colAmtETH) / book.coverage);
            await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
            await printCol(collateral, taker, 'PV drop to 125');
        });
    
        it('Collateral State change by FX IN_USE -> MARGINCALL -> LIQUIDATION -> AVAILABLE', async () => {
            let loanId = 0;
            let item, res, midRates;
        
            await printCol(collateral, taker, 'BEFORE PV drop');
            midRates = await fxMarket.getMidRates();
            console.log('FX midRates is', midRates.join(' '), '\n');
        
            let book, amtWithdraw;
            book = await collateral.getOneBook(taker);
            amtWithdraw = book.colAmtETH - Math.round((160 * book.colAmtETH) / book.coverage);
            await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
            await printCol(collateral, taker, 'PV drop to 160');
        
            book = await collateral.getOneBook(taker);
            expect(Number(book.state)).to.equal(ColState.IN_USE);
        
            // col state IN_USE -> MARGINCALL
            item = {
                pair: CcyPair.FILETH,
                offerInput: [Ccy.ETH, Ccy.FIL, 8900, 100000],
                bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8700],
                effectiveSec: 36000,
            };
            res = await fxMarket.setFXBook(...val(item), {from: alice});
            expectEvent(res, 'SetFXBook', {addr: alice});
        
            midRates = await fxMarket.getMidRates();
            console.log('FX midRates is', midRates.join(' '), '\n');
            await loan.updateBookPV(maker);
            // await collateral.updateState(taker);
            await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 82 to 88`);
        
            // col state MARGINCALL -> LIQUIDATION
            item = {
                pair: CcyPair.FILETH,
                offerInput: [Ccy.ETH, Ccy.FIL, 10600, 100000],
                bidInput: [Ccy.FIL, Ccy.ETH, 100000, 10400],
                effectiveSec: 36000,
            };
            res = await fxMarket.setFXBook(...val(item), {from: alice});
            expectEvent(res, 'SetFXBook', {addr: alice});
        
            midRates = await fxMarket.getMidRates();
            console.log('FX midRates is', midRates.join(' '), '\n');
            await loan.updateBookPV(maker);
            // await collateral.updateState(taker);
            await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 88 to 105`);
        
            // loan state WORKING -> TERMINATED
            // coll state LIQUIDATION -> LIQUIDATION_IN_PROGRESS
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `BEFORE liquidation ${await getDate()}`);
        
            // coll state LIQUIDATION_IN_PROGRESS -> AVAILABLE or EMPTY
            await loan.updateState(maker, taker, loanId);
            await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
        
            item = await loan.getLoanItem(loanId, {from: maker});
            expect(Number(item.state)).to.equal(LoanState.TERMINATED);
        });
    });

    describe('PV Calculation Test', async () => {
        beforeEach(async () => {
          const snapShot = await takeSnapshot();
          snapshotId = snapShot['result'];
        });
        afterEach(async () => {
          await revertToSnapshot(snapshotId);
        });
    
        let maker = alice; // FIL lender
        let taker = carol; // FIL borrower
    
        it('Check PV calculation made correctly', async () => {
          let loanId = 0;
    
          let DF = await lendingController.getDiscountFactorsForCcy(Ccy.FIL, {from: bob});
          let [df3m, df6m, df1y, df2y, df3y, df4y, df5y] = DF;
          console.log(df1y, df2y, df3y, df4y, df5y);
    
          // check if pv is correct
          item = await loan.getLoanItem(loanId, {from: maker});
          console.log('BEFORE MtM', item.pv, toDate(item.asOf));
          let [cf1, cf2, cf3, cf4, cf5] = item.schedule.amounts;
    
          // Manual check for pv
          let BP = 10000;
          let coupon = (item.rate * item.amt) / BP;
          let notional = item.amt;
          let pv = (cf1 * df1y + cf2 * df2y + cf3 * df3y + cf4 * df4y + cf5 * df5y) / BP;
    
          // await loan.updateAllPV();
          await loan.updateBookPV(maker);
          item = await loan.getLoanItem(loanId, {from: maker});
          console.log('AFTER MtM', item.pv, toDate(item.asOf));
          expect(Number(item.pv)).to.equal(Math.floor(pv));
        });
    
        it('Update PV by Yield Change', async () => {
          let loanId = 0;
    
          const pvUpdateAll = await loan.updateAllPV();
          console.log(`GasUsed: ${pvUpdateAll.receipt.gasUsed}`)
    
          const pvUpdate0 = await loan.updateBookPV(maker);
    
          let item = await loan.getLoanItem(loanId, {from: maker});
          console.log('BEFORE Yield Change', item.pv, toDate(item.asOf));
          let pv1 = item.pv;

          let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
          marketOrder = await _5yMarket.order(1, 15000, 1600, effectiveSec, {from: alice});
          await emitted(marketOrder, 'MakeOrder');

          const pvUpdate1 = await loan.updateBookPV(maker);
          console.log(`GasUsed: ${pvUpdate1.receipt.gasUsed}`)
    
          item = await loan.getLoanItem(loanId, {from: maker});
          console.log('AFTER  Yield Change', item.pv, toDate(item.asOf));
          let pv2 = item.pv;
    
          expect(Number(pv1)).not.to.equal(Number(pv2));
        });
      });    
});