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
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

const getDate = async () => {
  const currentTime = await time.latest();
  return toDate(currentTime);
};

describe("Loan Unit Tests", () => {
  const [alice, bob, carol] = accounts;
  const owner = defaultSender;

  const oneYear = Number(time.duration.years(1));
  const settleGap = Number(time.duration.days(2));
  const noticeGap = Number(time.duration.weeks(2));
  const oneSec = Number(time.duration.seconds(1));

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
    await moneyMarket.setColAddr(collateral.address);
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

  it("Init Collateral with sample data", async () => {
    sample.Collateral.forEach(async (item, index) => {
      let res = await collateral.setColBook(...val(item), {
        from: accounts[index],
        // value: 0,
        value: 100000,
      });
      expectEvent(res, "SetColBook", {addr: accounts[index]});
    });
  });

  it("Init with sample FXMarket", async () => {
    sample.FXMarket.forEach(async (item) => {
      let res = await fxMarket.setFXBook(...val(item), {from: alice});
      expectEvent(res, "SetFXBook", {addr: alice});
    });
  });

  it("Upsize ETH collateral", async () => {
    await printCol(collateral, accounts[2], "collateral state for carol before upSizeETH");
    let res = await collateral.upSizeETH({
      from: accounts[2],
      value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
    });
    expectEvent(res, "UpSizeETH", {addr: accounts[2]});
    await printCol(collateral, accounts[2], "collateral state for carol after upSizeETH");
  });

  it("Init with sample MoneyMarket", async () => {
    const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
    let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: alice});
    let res1 = await moneyMarket.setMoneyMarketBook(...val(item1), {from: alice});
    let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: bob});
    let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
    let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: alice});
    // expectEvent(res0, "SetMoneyMarketBook", {addr: alice});
    expectEvent(res1, "SetMoneyMarketBook", {addr: alice});
    // expectEvent(res2, "SetMoneyMarketBook", {addr: bob});
    // expectEvent(res3, "SetMoneyMarketBook", {addr: carol});
    // expectEvent(res4, "SetMoneyMarketBook", {addr: alice});
    await printCol(collateral, alice, "collateral state for alice after setMoneyMarketBook");
    // await printCol(collateral, bob, "collateral state for bob after setMoneyMarketBook");
    // await printCol(collateral, carol, "collateral state for carol after setMoneyMarketBook");
  });

  it("Init FIL custody addr", async () => {
    let res0 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex("cid_custody_FIL_0"), accounts[0]);
    let res1 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex("cid_custody_FIL_1"), accounts[1]);
    let res2 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex("cid_custody_FIL_2"), accounts[2]);
    expectEvent(res0, "RegisterFILCustodyAddr", {addr: accounts[0]});
    expectEvent(res1, "RegisterFILCustodyAddr", {addr: accounts[1]});
    expectEvent(res2, "RegisterFILCustodyAddr", {addr: accounts[2]});
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

    // lender - notifyPayment with txHash
    const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");
    await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker});

    // borrower check -> confirmPayment to ensure finality
    await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker});
    await printState(loan, collateral, maker, taker, loanId, "[confirmPayment]");

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));

    console.log("Loan amt before", beforeLoan.amt, "after", afterLoan.amt, "\n");
    await printSched(loan, maker, loanId);
  });

  it("Get Borrower Book for more than one loan", async () => {
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

  // it("FIL Loan initial settlement failure", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let item, loanId, beforeLoan, afterLoan;

  //   // maker LEND FIL
  //   item = sample.Loan[0];
  //   deal = [maker, ...val(item)]; // maker is FIL lender
  //   beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

  //   loanId = 0; // available from event
  //   let res = await loan.makeLoanDeal(...deal, {from: taker});
  //   expectEvent(res, "MakeLoanDeal", {
  //     makerAddr: maker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(item.amt),
  //     loanId: String(loanId),
  //   });

  //   await printLoan(loan, maker, loanId, "[before settlement] loan");
  //   await printCol(collateral, maker, "[before settlement] maker collateral");
  //   await printCol(collateral, taker, "[before settlement] taker collateral");

  //   // fail to lend within settlement period
  //   await time.increase(settleGap + oneSec);
  //   res = await loan.updateState(maker, taker, loanId);
  //   expectEvent(res, "UpdateState", {
  //     lender: maker,
  //     borrower: taker,
  //     loanId: String(loanId),
  //     prevState: String(LoanState.REGISTERED),
  //     currState: String(LoanState.CLOSED),
  //   });

  //   // lender - notifyPayment with txHash, but cannot
  //   const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");
  //   await expectRevert(
  //     loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker}),
  //     "No need to notify now",
  //   );

  //   // borrower -> confirmPayment to ensure finality, but cannot
  //   await expectRevert(
  //     loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker}),
  //     "No need to confirm now",
  //   );

  //   afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
  //   expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));
  //   console.log("Loan amt before", beforeLoan.amt, "after", afterLoan.amt, "\n");

  //   await printLoan(loan, maker, loanId, "[after settlement] loan");
  //   await printCol(collateral, maker, "[after settlement] maker collateral");
  //   await printCol(collateral, taker, "[after settlement] taker collateral");
  // });

  // it("State transition WORKING -> DUE -> PAST_DUE", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0; // available from event

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
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

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   const couponAmt = item.schedule.amounts[0];
  //   const {side, ccy, term, amt} = sample.Loan[0];

  //   // borrower notify coupon payment
  //   const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");
  //   await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});

  //   // lender confirm coupon receipt
  //   let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});

  //   // console.log('res is', res);
  //   expectEvent(res, "ConfirmPayment", {
  //     lender: maker,
  //     borrower: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //     txHash: txHash.padEnd(66, "0"),
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

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
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

  //   // loan state WORKING
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE notice ${await getDate()}`);
  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.DUE);

  //   const couponAmt = item.schedule.amounts[0];
  //   const {side, ccy, term, amt} = sample.Loan[0];

  //   // loan state DUE -> WORKING
  //   // borrower notify coupon payment
  //   const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");
  //   await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});

  //   // lender confirm coupon receipt
  //   let res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
  //   expectEvent(res, "ConfirmPayment", {
  //     lender: maker,
  //     borrower: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //     txHash: txHash.padEnd(66, "0"),
  //   });

  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER confirmation ${await getDate()}`);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   expect(Number(item.state)).to.equal(LoanState.WORKING);

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear);
  //   await loan.updateState(maker, taker, loanId);
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER notice ${await getDate()}`);

  //   // loan state DUE -> WORKING
  //   await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
  //   res = await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
  //   expectEvent(res, "ConfirmPayment", {
  //     lender: maker,
  //     borrower: taker,
  //     side: String(item.side),
  //     ccy: String(item.ccy),
  //     term: String(item.term),
  //     amt: String(couponAmt),
  //     loanId: String(loanId),
  //     txHash: txHash.padEnd(66, "0"),
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

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   const {side, ccy, term} = sample.Loan[0]; // get basic condition
  //   const paynums = [1, 1, 1, 2, 3, 5];
  //   const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");

  //   // TODO - test for short time
  //   if (term == Term._3m || term == Term._6m) return;

  //   // loan state WORKING -> DUE
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);

  //   // iter coupon payments until redeption
  //   for (i = 0; i < paynums[term] - 1; i++) {
  //     const couponAmt = item.schedule.amounts[i];
  //     // loan state DUE -> WORKING
  //     await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
  //     await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
  //     // loan state WORKING -> DUE
  //     await time.increase(oneYear);
  //     await loan.updateState(maker, taker, loanId);
  //   }

  //   // loan state DUE -> CLOSED
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE redemption ${await getDate()}`);
  //   const redeemAmt = item.schedule.amounts[paynums[term] - 1];
  //   await loan.notifyPayment(maker, taker, side, ccy, term, redeemAmt, loanId, txHash, {from: taker});
  //   res = await loan.confirmPayment(maker, taker, side, ccy, term, redeemAmt, loanId, txHash, {from: maker});
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER  redemption ${await getDate()}`);

  //   // item = await loan.getLoanItem(loanId, {from: maker});
  //   // console.log("item is", item);
  // });

  // it("Redemption State transition WORKING -> DUE -> PAST_DUE -> CLOSED", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   const {side, ccy, term} = sample.Loan[0]; // get basic condition
  //   const paynums = [1, 1, 1, 2, 3, 5];
  //   const txHash = web3.utils.asciiToHex("0x_this_is_sample_tx_hash");

  //   // TODO - test for short time
  //   if (term == Term._3m || term == Term._6m) return;

  //   // loan state WORKING -> DUE
  //   await printState(loan, collateral, maker, taker, loanId, `BEFORE due ${await getDate()}`);
  //   await time.increase(oneYear + settleGap - noticeGap + oneSec);
  //   await loan.updateState(maker, taker, loanId);

  //   // iter coupon payments until redeption
  //   for (i = 0; i < paynums[term] - 1; i++) {
  //     const couponAmt = item.schedule.amounts[i];
  //     // loan state DUE -> WORKING
  //     await loan.notifyPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: taker});
  //     await loan.confirmPayment(maker, taker, side, ccy, term, couponAmt, loanId, txHash, {from: maker});
  //     // loan state WORKING -> DUE
  //     await time.increase(oneYear);
  //     await loan.updateState(maker, taker, loanId);
  //   }

  //   // loan state DUE -> PAST_DUE
  //   await printState(loan, collateral, maker, taker, loanId, `AFTER due ${await getDate()}`);
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

  // it("Collateral State transition IN_USE -> MARGINCALL -> LIQUIDATION", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower

  //   await printCol(collateral, taker, "BEFORE PV drop");

  //   let book, amtWithdraw;
  //   book = await collateral.getOneBook(taker);
  //   amtWithdraw = book.colAmtETH - Math.round((150 * book.colAmtETH) / book.coverage);

  //   // console.log('book is', book);
  //   // console.log('amtWithdraw is', amtWithdraw);

  //   await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   await printCol(collateral, taker, "PV drop to 150");

  //   book = await collateral.getOneBook(taker);
  //   expect(Number(book.state)).to.equal(ColState.MARGIN_CALL);

  //   book = await collateral.getOneBook(taker);
  //   amtWithdraw = book.colAmtETH - Math.round((125 * book.colAmtETH) / book.coverage);
  //   await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   await printCol(collateral, taker, "PV drop to 125");
  // });

  // it("Collateral State change by FX IN_USE -> MARGINCALL -> LIQUIDATION -> AVAILABLE", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   let item, res, midRates;

  //   await printCol(collateral, taker, "BEFORE PV drop");
  //   midRates = await fxMarket.getMidRates();
  //   console.log("FX midRates is", midRates.join(" "), "\n");

  //   let book, amtWithdraw;
  //   book = await collateral.getOneBook(taker);
  //   amtWithdraw = book.colAmtETH - Math.round((160 * book.colAmtETH) / book.coverage);
  //   await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {from: taker});
  //   await printCol(collateral, taker, "PV drop to 160");

  //   book = await collateral.getOneBook(taker);
  //   expect(Number(book.state)).to.equal(ColState.IN_USE);

  //   // col state IN_USE -> MARGINCALL
  //   item = {
  //     pair: CcyPair.FILETH,
  //     offerInput: [Ccy.ETH, Ccy.FIL, 8900, 100000],
  //     bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8700],
  //     effectiveSec: 36000,
  //   };
  //   res = await fxMarket.setFXBook(...val(item), {from: alice});
  //   expectEvent(res, "SetFXBook", {addr: alice});

  //   midRates = await fxMarket.getMidRates();
  //   console.log("FX midRates is", midRates.join(" "), "\n");
  //   await loan.updateBookPV(maker);
  //   // await collateral.updateState(taker);
  //   await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 82 to 88`);

  //   // col state MARGINCALL -> LIQUIDATION
  //   item = {
  //     pair: CcyPair.FILETH,
  //     offerInput: [Ccy.ETH, Ccy.FIL, 10600, 100000],
  //     bidInput: [Ccy.FIL, Ccy.ETH, 100000, 10400],
  //     effectiveSec: 36000,
  //   };
  //   res = await fxMarket.setFXBook(...val(item), {from: alice});
  //   expectEvent(res, "SetFXBook", {addr: alice});

  //   midRates = await fxMarket.getMidRates();
  //   console.log("FX midRates is", midRates.join(" "), "\n");
  //   await loan.updateBookPV(maker);
  //   // await collateral.updateState(taker);
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

  // it("Check PV calculation made correctly", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   // console.log('DF is', await moneyMarket.getDiscountFactors());
  //   let DF = await moneyMarket.getDiscountFactors();
  //   let [df3m, df6m, df1y, df2y, df3y, df4y, df5y] = DF[Ccy.FIL];
  //   console.log(df1y, df2y, df3y, df4y, df5y);

  //   // check if pv is correct
  //   item = await loan.getLoanItem(loanId, { from: maker });
  //   console.log("BEFORE MtM", item.pv, toDate(item.asOf));
  //   let [cf1, cf2, cf3, cf4, cf5] = item.schedule.amounts;

  //   // Manual check for pv
  //   let BP = 10000;
  //   let coupon = (item.rate * item.amt) / BP;
  //   let notional = item.amt;
  //   let pv = (cf1 * df1y + cf2 * df2y + cf3 * df3y + cf4 * df4y + cf5 * df5y) / BP;

  //   // await loan.updateAllPV();
  //   await loan.updateBookPV(maker);
  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   console.log("AFTER MtM", item.pv, toDate(item.asOf));
  //   expect(Number(item.pv)).to.equal(Math.floor(pv));
  // });

  // it("Update PV by Yield Change", async () => {
  //   let maker = accounts[0]; // FIL lender
  //   let taker = accounts[2]; // FIL borrower
  //   let loanId = 0;

  //   await loan.updateBookPV(maker);

  //   let item = await loan.getLoanItem(loanId, {from: maker});
  //   console.log("BEFORE Yield Change", item.pv, toDate(item.asOf));
  //   let pv1 = item.pv;

  //   let input = {
  //     ccy: Ccy.FIL,
  //     lenders: [
  //       // [0, 10000, 900],
  //       // [1, 11000, 1000],
  //       // [2, 12000, 1100],
  //       // [3, 13000, 1200],
  //       // [4, 14000, 1300],
  //       [5, 15000, 1300], // changed from 1500 to 1300
  //     ],
  //     borrowers: [
  //     //   // [0, 10000, 700],
  //     //   // [1, 11000, 800],
  //     //   // [2, 12000, 900],
  //     //   // [3, 13000, 1000],
  //     //   // [4, 14000, 1100],
  //     //   [5, 15000, 1300],
  //     ],
  //     effectiveSec: 60 * 60 * 24 * 14,
  //   };

  //   await moneyMarket.setMoneyMarketBook(...val(input), {from: alice});
  //   // await moneyMarket.setOneItem(Side.LEND, Ccy.FIL, Term._5y, 15000, 1300, 360000, {from: alice});
  //   await loan.updateBookPV(maker);

  //   item = await loan.getLoanItem(loanId, {from: maker});
  //   console.log("AFTER  Yield Change", item.pv, toDate(item.asOf));
  //   let pv2 = item.pv;

  //   expect(Number(pv1)).not.to.equal(Number(pv2));
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
