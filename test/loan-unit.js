const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const {Side, Ccy, CcyPair, Term, LoanState, ColState, sample} = require('../test-utils').constants;
const {defaultSender} = require('@openzeppelin/test-environment');
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require('../test-utils/src/helper');
const {
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  SETTLE_GAP,
  NOTICE_GAP,
  ONE_YEAR,
  advanceTimeAndBlock,
  takeSnapshot,
  revertToSnapshot,
  getLatestTimestamp,
} = require('../test-utils').time;
const {emitted, reverted, notEmitted, equal, notEqual, isTrue, ok} = require('../test-utils').assert;

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

const expectRevert = reverted;

contract('Loan Unit Tests', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const users = [alice, bob, carol]; // without owner

  let snapshotId;
  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;

  const showBalances = async () => {
    console.log('alice', await web3.eth.getBalance(alice));
    console.log('bob  ', await web3.eth.getBalance(bob));
    console.log('carol', await web3.eth.getBalance(carol));
  };

  before('deploy Loan', async () => {
    let time = await getLatestTimestamp();
    console.log('before    ', toDate(time));

    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: owner});
    await moneyMarket.setColAddr(collateral.address);
    console.log();
    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket    addr is', fxMarket.address);
    console.log('collateral  addr is', collateral.address);
    console.log('loan        addr is', loan.address);
    console.log('owner       addr is', owner);
    console.log();
    console.log('alice       addr is', alice);
    console.log('bob         addr is', bob);
    console.log('carol       addr is', carol);
    console.log();
  });

  // beforeEach(async () => {
  //   const snapShot = await takeSnapshot();
  //   snapshotId = snapShot['result'];
  // });

  // afterEach(async () => {
  //   await revertToSnapshot(snapshotId);
  // });

  describe('Setup Test Data', async () => {
    it('Init Collateral with sample data', async () => {
      sample.Collateral.forEach(async (item, index) => {
        let res = await collateral.setColBook(...val(item), {
          from: users[index],
          // value: 0,
          value: 100000,
        });
        await expectEvent(res, 'SetColBook', {addr: users[index]});
      });
    });
    it('Init with sample FXMarket', async () => {
      sample.FXMarket.forEach(async (item) => {
        let res = await fxMarket.setFXBook(...val(item), {from: alice});
        await expectEvent(res, 'SetFXBook', {addr: alice});
      });
    });
    it('Upsize ETH collateral', async () => {
      await printCol(collateral, carol, 'collateral state for carol before upSizeETH');
      let res = await collateral.upSizeETH({
        from: carol,
        value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
      });
      await expectEvent(res, 'UpSizeETH', {addr: carol});
      await printCol(collateral, carol, 'collateral state for carol after upSizeETH');
    });
    it('Init with sample MoneyMarket', async () => {
      const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
      let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: alice});
      let res1 = await moneyMarket.setMoneyMarketBook(...val(item1), {from: alice});
      let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: bob});
      let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
      let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: alice});
      await expectEvent(res0, 'SetMoneyMarketBook', {addr: alice});
      await expectEvent(res1, 'SetMoneyMarketBook', {addr: alice});
      await expectEvent(res2, 'SetMoneyMarketBook', {addr: bob});
      await expectEvent(res3, 'SetMoneyMarketBook', {addr: carol});
      await expectEvent(res4, 'SetMoneyMarketBook', {addr: alice});
      await printCol(collateral, alice, 'collateral state for alice after setMoneyMarketBook');
      await printCol(collateral, bob, 'collateral state for bob after setMoneyMarketBook');
      await printCol(collateral, carol, 'collateral state for carol after setMoneyMarketBook');
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
      let item, loanId, beforeLoan, afterLoan;

      // maker LEND FIL
      item = sample.Loan[0];
      deal = [maker, ...val(item)]; // maker is FIL lender
      beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

      loanId = 0; // available from event
      let res = await loan.makeLoanDeal(...deal, {from: taker});
      await expectEvent(res, 'MakeLoanDeal', {
        makerAddr: maker,
        side: String(item.side),
        ccy: String(item.ccy),
        term: String(item.term),
        amt: String(item.amt),
        loanId: String(loanId),
      });

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

      afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
      expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));
      console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt, '\n');

      await printLoan(loan, maker, loanId, '[after settlement] loan');
      await printCol(collateral, maker, '[after settlement] maker collateral');
      await printCol(collateral, taker, '[after settlement] taker collateral');
    });
  });

  describe('Loan Test', async () => {
    it('FIL Loan Execution', async () => {
      let maker = alice; // FIL lender
      let taker = carol; // FIL borrower
      let item, loanId, beforeLoan, afterLoan;

      item = sample.Loan[0];
      deal = [maker, ...val(item)]; // maker is FIL lender

      beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
      loanId = 0; // available from event
      let res = await loan.makeLoanDeal(...deal, {from: taker});
      await printState(loan, collateral, maker, taker, loanId, '[makeLoanDeal]');
      console.log('deal item is', item);
      await expectEvent(res, 'MakeLoanDeal', {
        makerAddr: maker,
        side: String(item.side),
        ccy: String(item.ccy),
        term: String(item.term),
        amt: String(item.amt),
        loanId: String(loanId),
      });
      // lender - notifyPayment with txHash
      const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
      await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker});
      // borrower check -> confirmPayment to ensure finality
      await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker});
      await printState(loan, collateral, maker, taker, loanId, '[confirmPayment]');

      afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
      expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));
      console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt, '\n');
      await printSched(loan, maker, loanId);
    });

    it('Get Borrower Book for more than one loan', async () => {
      let item = sample.Loan[2];
      deal = [alice, ...val(item)]; // alice is maker
      // previous taker was carol and this taker is bob
      res = await loan.makeLoanDeal(...deal, {from: bob});
      // const lenderBook = await loan.getLenderBook(maker);
      // console.log("lenderBook is", lenderBook);
      const borrowerBookBob = await loan.getBorrowerBook(bob);
      // console.log("borrowerBook bob is", borrowerBookBob);
      const borrowerBookCarol = await loan.getBorrowerBook(carol);
      // console.log("borrowerBook bob is", borrowerBookCarol);
      expect(borrowerBookBob.loans[0].lender).to.equal(alice);
      expect(borrowerBookBob.loans[0].borrower).to.equal(bob);
      expect(borrowerBookCarol.loans[0].lender).to.equal(alice);
      expect(borrowerBookCarol.loans[0].borrower).to.equal(carol);
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

      // console.log('DF is', await moneyMarket.getDiscountFactors());
      let DF = await moneyMarket.getDiscountFactors();
      let [df3m, df6m, df1y, df2y, df3y, df4y, df5y] = DF[Ccy.FIL];
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

      await loan.updateBookPV(maker);

      let item = await loan.getLoanItem(loanId, {from: maker});
      console.log('BEFORE Yield Change', item.pv, toDate(item.asOf));
      let pv1 = item.pv;

      let input = {
        ccy: Ccy.FIL,
        lenders: [
          // [0, 10000, 900],
          // [1, 11000, 1000],
          // [2, 12000, 1100],
          // [3, 13000, 1200],
          // [4, 14000, 1300],
          [5, 15000, 1300], // changed from 1500 to 1300
        ],
        borrowers: [
          //   // [0, 10000, 700],
          //   // [1, 11000, 800],
          //   // [2, 12000, 900],
          //   // [3, 13000, 1000],
          //   // [4, 14000, 1100],
          //   [5, 15000, 1300],
        ],
        effectiveSec: 60 * 60 * 24 * 14,
      };

      await moneyMarket.setMoneyMarketBook(...val(input), {from: alice});
      // await moneyMarket.setOneItem(Side.LEND, Ccy.FIL, Term._5y, 15000, 1300, 360000, {from: alice});
      await loan.updateBookPV(maker);

      item = await loan.getLoanItem(loanId, {from: maker});
      console.log('AFTER  Yield Change', item.pv, toDate(item.asOf));
      let pv2 = item.pv;

      expect(Number(pv1)).not.to.equal(Number(pv2));
    });
  });

  // describe('Time Dependency Test', async () => {
  //   beforeEach(async () => {
  //     let time = await getDate();
  //     console.log('beforeEach', time);

  //     const snapShot = await takeSnapshot();
  //     snapshotId = snapShot['result'];
  //   });

  //   afterEach(async () => {
  //     await revertToSnapshot(snapshotId);

  //     let time = await getDate();
  //     console.log('afterEach ', time);
  //   });

  //   it('One day forward', async () => {
  //     await advanceTimeAndBlock(DAY);
  //     let time = await getDate();
  //     console.log('test01    ', time);

  //     console.log('hoge');
  //   });
  //   it('Coupon notice and payment', async () => {
  //     await advanceTimeAndBlock(YEAR - NOTICE_GAP);
  //     let time = await getDate();
  //     console.log('notice    ', time);
  //     await advanceTimeAndBlock(NOTICE_GAP);
  //     time = await getDate();
  //     console.log('payment    ', time);

  //     console.log('hoge hoge');
  //   });
  // });
});
