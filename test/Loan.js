const {accounts, defaultSender, contract, web3, provider} = require("@openzeppelin/test-environment");
const {expect} = require("chai");
const {BN, expectEvent, expectRevert, constants, time} = require("@openzeppelin/test-helpers");
const MoneyMarket = contract.fromArtifact("MoneyMarket");
const FXMarket = contract.fromArtifact("FXMarket");
const Collateral = contract.fromArtifact("Collateral");
const Loan = contract.fromArtifact("Loan");
const {Side, Ccy, Term, LoanState, ColState, sample} = require("./constants");
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

  it("State transition WORKING -> DUE -> PAST_DUE -> WORKING", async () => {
    let maker = accounts[0]; // FIL lender
    let taker = accounts[2]; // FIL borrower
    let loanId = 0; // available from event

    const oneYear = Number(time.duration.years(1));
    const noticeGap = Number(time.duration.weeks(2));
    const oneSec = Number(time.duration.seconds(1));

    // loan state WORKING
    await loan.updateState(maker, taker, loanId);
    await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
    let item = await loan.getLoanItem(loanId, {from: maker});
    expect(Number(item.state)).to.equal(LoanState.WORKING);

    // loan state WORKING -> DUE
    await time.increase(oneYear - noticeGap + oneSec);
    await loan.updateState(maker, taker, loanId);
    await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
    item = await loan.getLoanItem(loanId, {from: maker});
    expect(Number(item.state)).to.equal(LoanState.DUE);

    // loan state DUE -> PAST_DUE
    await time.increase(noticeGap + oneSec);
    await loan.updateState(maker, taker, loanId);
    await printState(loan, collateral, maker, taker, loanId, `PAST payment ${await getDate()}`);
    item = await loan.getLoanItem(loanId, {from: maker});
    expect(Number(item.state)).to.equal(LoanState.PAST_DUE);

    // check collateral state for maker and taker
    await printCol(collateral, maker, "COL for maker before PARTIAL_LIQUIDATION");
    await printCol(collateral, taker, "COL for taker before PARTIAL_LIQUIDATION");
  });

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
