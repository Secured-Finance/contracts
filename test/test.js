const {accounts, defaultSender, contract, web3, provider} = require("@openzeppelin/test-environment");
const {expect} = require("chai");
const {BN, expectEvent, expectRevert, constants, time} = require("@openzeppelin/test-helpers");
const MoneyMarket = contract.fromArtifact("MoneyMarket");
const FXMarket = contract.fromArtifact("FXMarket");
const Collateral = contract.fromArtifact("Collateral");
const Loan = contract.fromArtifact("Loan");
const {Side, Ccy, Term, sample} = require("./constants");
const {toDate, printDate, printNum, printCol, printLoan, printMoneyMkt, printDf, printRates} = require("./helper");

const val = (obj) => {
  return Object.values(obj);
};

describe("MoneyMarket", () => {
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

  it("Get market makers", async () => {
    const makers = await moneyMarket.getMarketMakers();
    console.log("makers is", makers);
    expect(makers[0]).to.equal(alice);
  });

  it("Get one item", async () => {
    const item = await moneyMarket.getOneItem(alice, Side.BORROW, Ccy.FIL, Term._3m);
    expect(item.amt).to.equal("10000");
    console.log('item is', item)
  });

  it("Get one book", async () => {
    // MoneyMarketItem[SIDE][CCY][TERM]
    const book = await moneyMarket.getOneBook(alice);
    const {term, amt, rate} = book[0][0][0];
    const testItem = [Number(term), Number(amt), Number(rate)];
    expect(testItem).deep.to.equal(sample.MoneyMarket[0]["lenders"][0]);
    // printMoneyMkt(book);
  });

  it("Get all books", async () => {
    const books = await moneyMarket.getAllBooks();
    expect(books.length).to.equal(3); // 3 market maker in sample
    // books.forEach((book) => {
    //   printMoneyMkt(book);
    // });
  });

  it("Get best book", async () => {
    const book = await moneyMarket.getBestBook();
    const {term, amt, rate} = book[1][1][0]; // borrower fil 3m
    const testItem = [Number(term), Number(amt), Number(rate)];
    expect(testItem).deep.to.equal(sample.MoneyMarket[3].borrowers[0]);
    // printMoneyMkt(book);
  });

  it("Get lender rates", async () => {
    const rates = await moneyMarket.getLenderRates();
    const lend = sample.MoneyMarket[0].lenders[0][2]; // lend 3m amt
    expect(Number(rates[0][0])).to.equal(lend);
    // printRates(rates);
  });

  it("Get borrower rates", async () => {
    const rates = await moneyMarket.getBorrowerRates();
    const borrow = sample.MoneyMarket[0].borrowers[0][2]; // borrow 3m amt
    expect(Number(rates[0][0])).to.equal(borrow);
    // printRates(rates);
  });

  it("Get mid rates", async () => {
    const rates = await moneyMarket.getMidRates();
    const lend = sample.MoneyMarket[0].lenders[0][2]; // lend 3m amt
    const borrow = sample.MoneyMarket[0].borrowers[0][2]; // borrow 3m amt
    expect(Number(rates[0][0])).to.equal((lend + borrow) / 2);
    // printRates(rates);
  });

  it("Get discount factors", async () => {
    const df = await moneyMarket.getDiscountFactors();
    expect(df[0].length).to.equal(7); // 3m 6m 1y 2y 3y 4y 5y
    // printDf(df);
  });

  it("Take one item", async () => {
    const amt = 20000;
    const book0 = await moneyMarket.getBestBook();
    const res = await moneyMarket.takeOneItem(carol, Side.BORROW, Ccy.FIL, Term._3m, amt);
    const book1 = await moneyMarket.getBestBook();
    expectEvent(res, "TakeOneItem", {
      addr: carol,
      side: String(Side.BORROW),
      ccy: String(Ccy.FIL),
      term: String(Term._3m),
      amt: String(amt),
    });
    expect(Number(book0[1][1][0].amt) - amt).to.equal(Number(book1[1][1][0].amt)); // borrow FIL 3m
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Take one item full amount", async () => {
    const book0 = await moneyMarket.getBestBook();
    const amt = Number(book0[1][1][0].amt);
    const res = await moneyMarket.takeOneItem(carol, Side.BORROW, Ccy.FIL, Term._3m, amt);
    const book1 = await moneyMarket.getBestBook();
    expectEvent(res, "TakeOneItem", {
      addr: carol,
      side: String(Side.BORROW),
      ccy: String(Ccy.FIL),
      term: String(Term._3m),
      amt: String(amt),
    });
    expect(book1[1][1][0].addr).to.equal(bob);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Add back one item", async () => {
    const book0 = await moneyMarket.getBestBook();
    const item = {
      ccy: 1,
      lenders: [],
      borrowers: [[0, 5000, 780]],
      effectiveSec: 60 * 60 * 24 * 14,
    };
    let res = await moneyMarket.setMoneyMarketBook(...val(item), {from: carol});
    expectEvent(res, "SetMoneyMarketBook", {sender: carol});
    const book1 = await moneyMarket.getBestBook();
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Delete one item", async () => {
    const book0 = await moneyMarket.getBestBook();
    const res = await moneyMarket.delOneItem(carol, Side.BORROW, Ccy.FIL, Term._3m);
    const book1 = await moneyMarket.getBestBook();
    expectEvent(res, "DelOneItem", {
      addr: carol,
      side: String(Side.BORROW),
      ccy: String(Ccy.FIL),
      term: String(Term._3m),
    });
    expect(book0[1][1][0]).to.not.equal(book1[1][1][0]); // borrow FIL 3m
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Delete one book", async () => {
    const book0 = await moneyMarket.getOneBook(carol);
    const res = await moneyMarket.delMoneyMarketBook({from: carol});
    const book1 = await moneyMarket.getOneBook(carol);
    expectEvent(res, "DelMoneyMarketBook", {sender: carol});
    expect(book1.isValue).to.equal(false);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Add back one book", async () => {
    const book0 = await moneyMarket.getOneBook(carol);
    const item = sample.MoneyMarket[3]; // borrow FIL 3m by carol
    let res = await moneyMarket.setMoneyMarketBook(...val(item), {from: carol});
    const book1 = await moneyMarket.getOneBook(carol);
    expectEvent(res, "SetMoneyMarketBook", {sender: carol});
    expect(book1.isValue).to.equal(true);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  // it('Init Collateral with sample data', async () => {
  //   input = sample.Collateral;
  //   let res;
  //   res = await collateral.setColBook(input[0].id, input[0].addrFIL, {
  //     from: accounts[0],
  //     value: 10000,
  //   });
  //   expectEvent(res, 'SetColBook', {sender: accounts[0]});
  //   res = await collateral.setColBook(input[1].id, input[1].addrFIL, {
  //     from: accounts[1],
  //     value: 10000,
  //   });
  //   expectEvent(res, 'SetColBook', {sender: accounts[1]});
  //   res = await collateral.setColBook(input[2].id, input[2].addrFIL, {
  //     from: accounts[2],
  //   });
  //   expectEvent(res, 'SetColBook', {sender: accounts[2]});

  //   res = await collateral.registerFILCustodyAddr(
  //     'cid_custody_FIL_0',
  //     accounts[0],
  //   );
  //   expectEvent(res, 'RegisterFILCustodyAddr', {requester: accounts[0]});
  //   res = await collateral.registerFILCustodyAddr(
  //     'cid_custody_FIL_1',
  //     accounts[1],
  //   );
  //   expectEvent(res, 'RegisterFILCustodyAddr', {requester: accounts[1]});
  //   res = await collateral.registerFILCustodyAddr(
  //     'cid_custody_FIL_2',
  //     accounts[2],
  //   );
  //   expectEvent(res, 'RegisterFILCustodyAddr', {requester: accounts[2]});
  // });

  // it('Collateralize', async () => {
  //   await printCol(collateral, accounts[2], 'Registered');
  //   let res = await collateral.upSizeETH({
  //     from: accounts[2],
  //     value: 20000, // 20000 ETH can cover about 244000 FIL
  //     // value: 1000000000000000000, // 1 ETH in wei
  //   });
  //   expectEvent(res, 'UpSizeETH', {sender: accounts[2]});
  //   await printCol(collateral, accounts[2], 'upSizeETH (ETH 20000 added)');
  // });

  // let beforeLoan;
  // let afterLoan;
  // it('Make Loan Deal', async () => {
  //   input = sample.Loan;
  //   input.makerAddr = accounts[0];
  //   beforeLoan = await moneyMarket.getOneItem(
  //     input.makerAddr,
  //     input.side,
  //     input.ccy,
  //     input.term,
  //   );

  //   // console.log('input is', input)

  //   // Init Loan with sample data
  //   let taker = accounts[2];
  //   let res = await loan.makeLoanDeal(
  //     input.makerAddr,
  //     input.side,
  //     input.ccy,
  //     input.term,
  //     input.amt,
  //     {
  //       from: taker,
  //     },
  //   );
  //   expectEvent(res, 'MakeLoanDeal', {sender: taker});
  //   await printCol(
  //     collateral,
  //     accounts[2],
  //     'makeLoanDeal (borrow FIL 140001, FILETH is 0.082)',
  //   );
  //   await printLoan(loan, accounts[2], '');
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
