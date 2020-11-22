const {accounts, defaultSender, contract, web3, provider} = require("@openzeppelin/test-environment");
const {expect} = require("chai");
const {BN, expectEvent, expectRevert, constants, time} = require("@openzeppelin/test-helpers");
const MoneyMarket = contract.fromArtifact("MoneyMarket");
const FXMarket = contract.fromArtifact("FXMarket");
const Collateral = contract.fromArtifact("Collateral");
const Loan = contract.fromArtifact("Loan");
const {Side, Ccy, Term, sample} = require("./constants");
const {toDate, printDate, printNum, printCol, printLoan, printMoneyMkt, printDf} = require("./helper");

const val = (obj) => {
  return Object.values(obj);
};

describe("MoneyMarket", () => {
  const [alice, bob, carol] = accounts;
  const from = {from: defaultSender};
  const sender = {sender: defaultSender};
  const owner = defaultSender;

  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;

  before(async () => {
    // beforeEach(async () => {
    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    console.log();
    console.log("moneyMarket addr is", moneyMarket.address);
    console.log("fxMarket    addr is", fxMarket.address);
    console.log("collateral  addr is", collateral.address);
    console.log("loan        addr is", loan.address);
    console.log();
    console.log("default     addr is", defaultSender);
    console.log("alice       addr is", alice);
    console.log("bob         addr is", alice);
    console.log("carol       addr is", alice);
    // console.log("accounts is", accounts);
  });

  it("Init with sample MoneyMarket", async () => {
    sample.MoneyMarket.forEach(async (item) => {
      let input = val(item);
      let res = await moneyMarket.setMoneyMarketBook(...input);
      expectEvent(res, "SetMoneyMarketBook", sender);
    });
  });

  it("Init with sample FXMarket", async () => {
    sample.FXMarket.forEach(async (item) => {
      let input = val(item);
      let res = await fxMarket.setFXBook(...input);
      expectEvent(res, "SetFXBook", sender);
    });
  });

  it("Get mid rates", async () => {
    const midRates = await moneyMarket.getMidRates();
    const lend = sample.MoneyMarket[0].lenders[0][2]; // lend 3m amt
    const borrow = sample.MoneyMarket[0].borrowers[0][2]; // borrow 3m amt
    expect(Number(midRates[0][0])).to.equal((lend + borrow) / 2);
    // const Ccy = ["ETH", "FIL", "USDC"];
    // midRates.forEach((rates, index) => {
    //   console.log(Ccy[index]);
    //   printNum(rates);
    // });
  });

  it("Get discount factors", async () => {
    const df = await moneyMarket.getDiscountFactors();
    expect(df[0].length).to.equal(7); // 3m 6m 1y 2y 3y 4y 5y
    // printDf(df);
  });

  it("Get one item", async () => {
    const item = await moneyMarket.getOneItem(owner, Side.BORROW, Ccy.FIL, Term._3m);
    expect(item.amt).to.equal("10000");
    // console.log('item is', item)
  });

  it("Get one book", async () => {
    // MoneyMarketItem[SIDE][CCY][TERM]
    const book = await moneyMarket.getOneBook(owner);
    const {term, amt, rate} = book[0][0][0];
    const testItem = [Number(term), Number(amt), Number(rate)];
    expect(testItem).deep.to.equal(sample.MoneyMarket[0]["lenders"][0]);
    // printMoneyMkt(book);
  });

  it("Get all books", async () => {
    const books = await moneyMarket.getAllBooks();
    expect(books.length).to.equal(1); // one market maker in sample
    // books.forEach((book) => {
    //   printMoneyMkt(book);
    // });
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
