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
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

describe("MoneyMarket Unit Tests", () => {
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

  it("Init with sample MoneyMarket", async () => {
    const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
    let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: alice});
    let res1 = await moneyMarket.setMoneyMarketBook(...val(item1), {from: alice});
    let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: bob});
    let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
    let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: alice});
    expectEvent(res0, "SetMoneyMarketBook", {addr: alice});
    expectEvent(res1, "SetMoneyMarketBook", {addr: alice});
    expectEvent(res2, "SetMoneyMarketBook", {addr: bob});
    expectEvent(res3, "SetMoneyMarketBook", {addr: carol});
    expectEvent(res4, "SetMoneyMarketBook", {addr: alice});
    // await printCol(collateral, alice, "collateral state for alice after setMoneyMarketBook");
    // await printCol(collateral, bob, "collateral state for bob after setMoneyMarketBook");
    // await printCol(collateral, carol, "collateral state for carol after setMoneyMarketBook");
  });

  it("Get market makers", async () => {
    const makers = await moneyMarket.getMarketMakers();
    // console.log("makers is", makers);
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
    const {term, amt, rate} = book[Side.LEND][Ccy.ETH][Term._3m];
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
    const {term, amt, rate} = book[Side.BORROW][Ccy.FIL][Term._3m];
    const testItem = [Number(term), Number(amt), Number(rate)];
    expect(testItem).deep.to.equal(sample.MoneyMarket[1].borrowers[0]);
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
    const book0 = await moneyMarket.getBestBook();

    const testItem = book0.borrowers[Ccy.FIL][Term._3m];
    const amt = testItem.amt * 0.25;

    const res = await moneyMarket.takeOneItem(alice, Side.BORROW, Ccy.FIL, Term._3m, amt);
    const book1 = await moneyMarket.getBestBook();
    expectEvent(res, "TakeOneItem", {
      addr: alice,
      side: String(Side.BORROW),
      ccy: String(Ccy.FIL),
      term: String(Term._3m),
      amt: String(amt),
    });
    expect(Number(testItem.amt) - amt).to.equal(Number(book1.borrowers[Ccy.FIL][Term._3m].amt)); // borrow FIL 3m
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Take one item full amount", async () => {
    const book0 = await moneyMarket.getBestBook();
    const amt = Number(book0[Side.BORROW][Ccy.FIL][Term._3m].amt);
    const res = await moneyMarket.takeOneItem(alice, Side.BORROW, Ccy.FIL, Term._3m, amt);
    expectEvent(res, "TakeOneItem", {
      addr: alice,
      side: String(Side.BORROW),
      ccy: String(Ccy.FIL),
      term: String(Term._3m),
      amt: String(amt),
    });
    const book1 = await moneyMarket.getBestBook();
    expect(book1[Side.BORROW][Ccy.FIL][Term._3m].addr).to.equal(bob);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Add back one item", async () => {
    const book0 = await moneyMarket.getBestBook();
    const item = {
      ccy: Ccy.FIL,
      lenders: [],
      borrowers: [[0, 5000, 780]],
      effectiveSec: 60 * 60 * 24 * 14,
    };
    let res = await moneyMarket.setMoneyMarketBook(...val(item), {from: alice});
    expectEvent(res, "SetMoneyMarketBook", {addr: alice});
    // const book1 = await moneyMarket.getBestBook();
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
    expectEvent(res, "DelMoneyMarketBook", {addr: carol});
    expect(book1.isValue).to.equal(false);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });

  it("Add back one book", async () => {
    const book0 = await moneyMarket.getOneBook(carol);
    const item = sample.MoneyMarket[3]; // borrow FIL 3m by carol
    let res = await moneyMarket.setMoneyMarketBook(...val(item), {from: carol});
    const book1 = await moneyMarket.getOneBook(carol);
    expectEvent(res, "SetMoneyMarketBook", {addr: carol});
    expect(book1.isValue).to.equal(true);
    // printMoneyMkt(book0);
    // printMoneyMkt(book1);
  });
});
