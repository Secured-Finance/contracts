const {accounts, defaultSender, contract, web3, provider} = require("@openzeppelin/test-environment");
const {expect} = require("chai");
const {BN, expectEvent, expectRevert, constants, time} = require("@openzeppelin/test-helpers");
const MoneyMarket = contract.fromArtifact("MoneyMarket");
const FXMarket = contract.fromArtifact("FXMarket");
const Collateral = contract.fromArtifact("Collateral");
const Loan = contract.fromArtifact("Loan");
const {Side, Ccy, CcyPair, Term, LoanState, ColState, sample} = require("./constants");
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
  printMoneyMkt,
  printDf,
  printRates,
} = require("./helper");

const val = (obj) => {
  return Object.values(obj);
};

const getDate = async () => {
  const currentTime = await time.latest();
  return toDate(currentTime);
};

describe("Loan Unit Tests", () => {
  const [alice, bob, carol] = accounts;
  const owner = defaultSender;

  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;

  before(async () => {
    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: owner});
    console.log();
    console.log("moneyMarket addr is", moneyMarket.address);
    console.log("fxMarket    addr is", fxMarket.address);
    console.log("collateral  addr is", collateral.address);
    console.log("loan        addr is", loan.address);
    console.log("owner       addr is", owner);
    console.log();
    console.log("alice       addr is", alice);
    console.log("bob         addr is", bob);
    console.log("carol       addr is", carol);
  });

  it("Init with sample MoneyMarket", async () => {
    const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
    let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: alice});
    let res1 = await moneyMarket.setMoneyMarketBook(...val(item1), {from: alice});
    let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: bob});
    let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
    let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: alice});
    expectEvent(res0, "SetMoneyMarketBook", {sender: alice});
    expectEvent(res1, "SetMoneyMarketBook", {sender: alice});
    expectEvent(res2, "SetMoneyMarketBook", {sender: bob});
    expectEvent(res3, "SetMoneyMarketBook", {sender: carol});
    expectEvent(res4, "SetMoneyMarketBook", {sender: alice});
  });

  it("Init with sample FXMarket", async () => {
    sample.FXMarket.forEach(async (item) => {
      let res = await fxMarket.setFXBook(...val(item), {from: alice});
      expectEvent(res, "SetFXBook", {sender: alice});
    });
  });

  it("Init Collateral with sample data", async () => {
    sample.Collateral.forEach(async (item, index) => {
      let res = await collateral.setColBook(...val(item), {
        from: accounts[index],
        value: 100000,
      });
      expectEvent(res, "SetColBook", {sender: accounts[index]});
    });
  });

  it("Init FIL custody addr", async () => {
    let res0 = await collateral.registerFILCustodyAddr("cid_custody_FIL_0", accounts[0]);
    let res1 = await collateral.registerFILCustodyAddr("cid_custody_FIL_1", accounts[1]);
    let res2 = await collateral.registerFILCustodyAddr("cid_custody_FIL_2", accounts[2]);
    expectEvent(res0, "RegisterFILCustodyAddr", {requester: accounts[0]});
    expectEvent(res1, "RegisterFILCustodyAddr", {requester: accounts[1]});
    expectEvent(res2, "RegisterFILCustodyAddr", {requester: accounts[2]});
  });

  it("Upsize ETH collateral", async () => {
    await printCol(collateral, accounts[2], "collateral state for carol before upSizeETH");
    let res = await collateral.upSizeETH({
      from: accounts[2],
      value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
    });
    expectEvent(res, "UpSizeETH", {sender: accounts[2]});
    await printCol(collateral, accounts[2], "collateral state for carol after upSizeETH");
  });

  it("FIL Loan Execution", async () => {
    let maker = accounts[0]; // FIL lender
    let taker = accounts[2]; // FIL borrower
    let item, loanId, beforeLoan, afterLoan;

    // maker LEND FIL
    item = sample.Loan[0];
    deal = [maker, ...val(item)]; // maker is FIL lender
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0; // available from event
    let res = await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, maker, taker, loanId, "[makeLoanDeal]");

    console.log("deal item is", item);

    expectEvent(res, "MakeLoanDeal", {
      makerAddr: maker,
      side: String(item.side),
      ccy: String(item.ccy),
      term: String(item.term),
      amt: String(item.amt),
      loanId: String(loanId),
    });

    // notifyPayment -> check -> confirmPayment to ensure finality
    await loan.confirmPayment(maker, taker, ...val(item), loanId, {from: taker}); // taker is borrower
    await printState(loan, collateral, maker, taker, loanId, "[confirmPayment]");

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));

    console.log("Loan amt before", beforeLoan.amt, "after", afterLoan.amt, "\n");
    await printSched(loan, maker, loanId);
  });

  // it("State transition WORKING -> DUE -> PAST_DUE", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0; // available from event

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   // loan state DUE -> PAST_DUE
  //   await time.increase(noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.PAST_DUE);
  // });

  // it("State transition WORKING -> DUE -> WORKING", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0; // available from event

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   const couponAmt = item.schedule.amounts[0];
  //   const {side, ccy, term, amt} = sample.Loan[0];

  //   // lender confirm coupon receipt
  //   let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, {from: maker});
  //   expectEvent(res, "ConfirmPayment", {
  //     loanMaker: maker,
  //     colUser: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //   });

  //   // loan state DUE -> WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);
  // });

  // it("State transition WORKING -> DUE -> PAST_DUE -> WORKING", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0; // available from event
  //   console.log("maker is", maker);
  //   console.log("taker is", taker);

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   // loan state DUE -> PAST_DUE
  //   await time.increase(noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.PAST_DUE);

  //   // loan state PAST_DUE -> WORKING
  //   await loan.updateState(maker, taker, loanId, {from: taker});
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);
  // });

  // it("State transition WORKING -> DUE -> WORKING -> DUE -> WORKING", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   const couponAmt = item.schedule.amounts[0];
  //   const {side, ccy, term, amt} = sample.Loan[0];

  //   // loan state DUE -> WORKING
  //   let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, {from: maker});
  //   expectEvent(res, "ConfirmPayment", {
  //     loanMaker: maker,
  //     colUser: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //   });
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, { from: maker });
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);

  //   // loan state DUE -> WORKING
  //   res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, {from: maker});
  //   expectEvent(res, "ConfirmPayment", {
  //     loanMaker: maker,
  //     colUser: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //   });
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);
  // });

  // it("Redemption State transition WORKING -> DUE -> CLOSED", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   const {side, ccy, term} = sample.Loan[0]; // get basic condition
  //   const paynums = [1, 1, 1, 2, 3, 5];

  //   // TODO - test for short time
  //   if (term == Term._3m || term == Term._6m) return;

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);

  //   // iter coupon payments until redeption
  //   for (i = 0; i < paynums[term] - 1; i++) {
  //     const couponAmt = item.schedule.amounts[i];
  //     // loan state DUE -> WORKING
  //     await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, {from: maker});
  //     // loan state WORKING -> DUE
  //     await time.increase(oneYear);
  //     await loan.updateState(maker, taker, loanId);
  //   }

  //   // loan state DUE -> CLOSED
  //   const redeemAmt = item.schedule.amounts[paynums[term] - 1];
  //   res = await loan.confirmPayment(maker, taker, side, ccy, term, redeemAmt, loanId, {from: maker});
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER redemption ${await getDate()}`);

  //   // item = await loan.getLoanItem(loanId, {from: maker});
  //   // console.log("item is", item);
  // });

  // it("Redemption State transition WORKING -> DUE -> PAST_DUE -> CLOSED", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   const oneYear = Number(time.duration.years(1));
  //   const noticeGap = Number(time.duration.weeks(2));
  //   const oneSec = Number(time.duration.seconds(1));

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   const {side, ccy, term} = sample.Loan[0]; // get basic condition
  //   const paynums = [1, 1, 1, 2, 3, 5];

  //   // TODO - test for short time
  //   if (term == Term._3m || term == Term._6m) return;

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);

  //   // iter coupon payments until redeption
  //   for (i = 0; i < paynums[term] - 1; i++) {
  //     const couponAmt = item.schedule.amounts[i];
  //     // loan state DUE -> WORKING
  //     await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, {from: maker});
  //     // loan state WORKING -> DUE
  //     await time.increase(oneYear);
  //     await loan.updateState(maker, taker, loanId);
  //   }

  //   // loan state DUE -> PAST_DUE
  //   await time.increase(noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.PAST_DUE);

  //   // loan state PAST_DUE -> CLOSED
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.CLOSED);

  //   // item = await loan.getLoanItem(loanId, {from: maker});
  //   // console.log("item is", item);
  // });

  // it("Collateral State transition IN_USE -> MARGINCALL", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower

  //   await printCol(collateral, taker, "BEFORE PV drop");

  //   let book, amtWithdraw;
  //   book = await collateral.getOneBook(taker);
  //   amtWithdraw = book.amtETH - Math.round((150 * book.amtETH) / book.coverage);
  //   await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   await printCol(collateral, taker, "PV drop to 150");

  //   book = await collateral.getOneBook(taker);
  //   expect(Number(book.state)).to.equal(ColState.MARGIN_CALL);

  //   // TODO - book.state should be IN_USE or AVAILABLE
  //   // book = await collateral.getOneBook(taker);
  //   // amtWithdraw = book.amtETH - Math.round((125 * book.amtETH) / book.coverage);
  //   // await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   // await printCol(collateral, taker, "PV drop to 125");
  // });

  // it("Collateral State change by FX IN_USE -> MARGINCALL -> LIQUIDATION", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   await printCol(collateral, taker, "BEFORE PV drop");

  //   let book, amtWithdraw;
  //   book = await collateral.getOneBook(taker);
  //   amtWithdraw = book.amtETH - Math.round((160 * book.amtETH) / book.coverage);
  //   await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   await printCol(collateral, taker, "PV drop to 160");

  //   book = await collateral.getOneBook(taker);
  //   expect(Number(book.state)).to.equal(ColState.IN_USE);

  //   // col state IN_USE -> MARGINCALL
  //   let item, res, midRates;
  //   item = {
  //     pair: CcyPair.FILETH,
  //     offerInput: [Ccy.ETH, Ccy.FIL, 8900, 100000],
  //     bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8700],
  //     effectiveSec: 36000,
  //   };
  //   res = await fxMarket.setFXBook(...val(item), {from: alice});
  //   expectEvent(res, "SetFXBook", {sender: alice});

  //   midRates = await fxMarket.getMidRates();
  //   console.log("FX midRates is", midRates.join(" "), "\n");
  //   await collateral.updateState(taker);
  //   await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 82 to 88`);

  //   // col state MARGINCALL -> LIQUIDATION
  //   item = {
  //     pair: CcyPair.FILETH,
  //     offerInput: [Ccy.ETH, Ccy.FIL, 10600, 100000],
  //     bidInput: [Ccy.FIL, Ccy.ETH, 100000, 10400],
  //     effectiveSec: 36000,
  //   };
  //   res = await fxMarket.setFXBook(...val(item), {from: alice});
  //   expectEvent(res, "SetFXBook", {sender: alice});

  //   midRates = await fxMarket.getMidRates();
  //   console.log("FX midRates is", midRates.join(" "), "\n");
  //   await collateral.updateState(taker);
  //   await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 88 to 105`);

  //   // loan state WORKING -> TERMINATED
  //   // coll state LIQUIDATION -> LIQUIDATION_IN_PROGRESS
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE liquidation ${await getDate()}`);

  //   // coll state LIQUIDATION_IN_PROGRESS -> AVAILABLE or EMPTY
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER liquidation ${await getDate()}`);

  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.TERMINATED);
  // });

  it("Check PV calculation made correctly", async () => {
    let maker = accounts[0]; // FIL lender
    let taker = accounts[2]; // FIL borrower
    let loanId = 0;

    // console.log('DF is', await moneyMarket.getDiscountFactors());
    let DF = await moneyMarket.getDiscountFactors();
    let [df3m, df6m, df1y, df2y, df3y, df4y, df5y] = DF[Ccy.FIL];
    console.log(df1y, df2y, df3y, df4y, df5y);

    // check if pv is correct
    item = await loan.getLoanItem(loanId, {from: maker});
    console.log("BEFORE MtM", item.pv, toDate(item.asOf));
    let [cf1, cf2, cf3, cf4, cf5] = item.schedule.amounts;

    // Manual check for pv
    let BP = 10000;
    let coupon = (item.rate * item.amt) / BP;
    let notional = item.amt;
    let pv = (cf1 * df1y + cf2 * df2y + cf3 * df3y + cf4 * df4y + cf5 * df5y) / BP;
    // console.log('pv is', pv);

    await loan.updateAllPV();
    // await loan.updateBookPV(maker);
    item = await loan.getLoanItem(loanId, {from: maker});
    console.log("AFTER MtM", item.pv, toDate(item.asOf));
    expect(Number(item.pv)).to.equal(Math.floor(pv));
  });

  // it("Update PV by yield change", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   console.log("BEFORE MtM", item.pv, toDate(item.asOf));

  //   await loan.updateAllPV();

  //   item = await loan.getLoanItem(loanId, { from: maker });
  //   console.log("AFTER MtM", item.pv, toDate(item.asOf));
  // });

  // it('Confirm FIL Payment', async () => {
  //   let res = await loan.confirmFILPayment(0, {
  //     from: accounts[2],
  //   });
  //   expectEvent(res, 'ConfirmFILPayment', {sender: accounts[2]});
  //   await printCol(
  //     collateral,
  //     accounts[2],
  //     'confirmFILPayment (coverage 174%)',
  //   );
  //   await printLoan(loan, accounts[2], '');
  // });

  // it('Loan Item Test', async () => {
  //   afterLoan = await moneyMarket.getOneItem(
  //     input.makerAddr,
  //     input.side,
  //     input.ccy,
  //     input.term,
  //   );
  //   console.log(
  //     'FIL loan market before',
  //     beforeLoan.amt,
  //     'FIL loan market after',
  //     afterLoan.amt,
  //   );

  //   // loan item test
  //   let book = await loan.getOneBook(accounts[2]);
  //   let loanItem = book.loans[0];
  //   printDate(loanItem.schedule.notices);
  //   printDate(loanItem.schedule.payments);
  //   console.log(loanItem.schedule.amounts);

  //   // discount factor test
  //   let df = await moneyMarket.getDiscountFactors();
  //   printNum(df[0]);
  //   printNum(df[1]);
  // });
});

// describe('Forward simulation', () => {
//   it('Check time forward 100 millisec', async () => {
//     let latest = await time.latest();
//     // console.log('latest is', latest.toString(), toDate(latest));
//     await time.increase(100);
//     let latest2 = await time.latest();
//     // console.log('latest2 is', latest2.toString(), toDate(latest2));
//     expect(latest2 - latest).to.equal(100);
//   });
//   it('Check time forward 1 month', async () => {
//     // let latestBlock = await time.latestBlock();
//     // console.log('latestBlock is', latestBlock.toString());
//     let latest = await time.latest();
//     const notice = time.duration.years(1) / 12 - time.duration.weeks(2);
//     await time.increase(notice);
//     let latest2 = await time.latest();
//     const payment = time.duration.weeks(2);
//     await time.increase(payment);
//     let latest3 = await time.latest();
//     // console.log(latest, latest2, latest3)
//     // expect(latest2 - latest).to.equal(notice);
//     // expect(latest3 - latest2).to.equal(payment);
//     console.log('latest is', latest.toString(), toDate(latest));
//     console.log('latest2 is', latest2.toString(), toDate(latest2));
//     console.log('latest3 is', latest3.toString(), toDate(latest3));
//   });
// })
