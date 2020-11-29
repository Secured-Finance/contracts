const MoneyMarket = artifacts.require("MoneyMarket");
const FXMarket = artifacts.require("FXMarket");
const Collateral = artifacts.require("Collateral");
const Loan = artifacts.require("Loan");
const {Side, Ccy, Term, sample} = require("../test/constants");
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require("../test/helper");

module.exports = async function main(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    console.log(accounts);

    // const moneyMarket = await MoneyMarket.deployed();
    // const fxMarket = await FXMarket.deployed();
    // const collateral = await Collateral.deployed();
    // const loan = await Loan.deployed();

    const moneyMarket = await MoneyMarket.new();
    const fxMarket = await FXMarket.new();
    const collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    const loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);

    console.log("moneyMarket addr is", moneyMarket.address);
    console.log("fxMarket addr is", fxMarket.address);
    console.log("collateral addr is", collateral.address);
    console.log("loan addr is", loan.address);
    console.log("\n");

    // Init MoneyMarket with sample data
    await moneyMarket.setMoneyMarketBook(...Object.values(sample.MoneyMarket[0]));
    await moneyMarket.setMoneyMarketBook(...Object.values(sample.MoneyMarket[1]));
    await moneyMarket.setMoneyMarketBook(...Object.values(sample.MoneyMarket[2]));
    await moneyMarket.setMoneyMarketBook(...Object.values(sample.MoneyMarket[3]));
    await moneyMarket.setMoneyMarketBook(...Object.values(sample.MoneyMarket[4]));
    let midRates = await moneyMarket.getMidRates();
    console.log("Loan midRates is");
    console.log("FIL ", midRates[0].join(" "));
    console.log("ETH ", midRates[1].join(" "));
    console.log("USDC", midRates[2].join(" "), "\n");

    // discount factor test
    let df = await moneyMarket.getDiscountFactors();
    console.log("DF is");
    console.log("FIL ", df[0].join(" "));
    console.log("ETH ", df[1].join(" "));
    console.log("USDC", df[2].join(" "), "\n");

    // Init FXMarket with sample data
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[0]));
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[1]));
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[2]));
    midRates = await fxMarket.getMidRates();
    console.log("FX midRates is", midRates.join(" "), "\n");

    // Init Collateral with sample data
    input = sample.Collateral;
    await collateral.setColBook(...Object.values(input[0]), {
      // await collateral.setColBook(input[0].id, input[0].addrFIL, {
      from: accounts[0],
      value: 10000,
    });
    await collateral.setColBook(...Object.values(input[1]), {
      // await collateral.setColBook(input[1].id, input[1].addrFIL, {
      from: accounts[1],
      value: 10000,
    });
    await collateral.setColBook(...Object.values(input[2]), {
      // await collateral.setColBook(input[2].id, input[2].addrFIL, {
      from: accounts[2],
    });
    await collateral.registerFILCustodyAddr("cid_custody_FIL_0", accounts[0]);
    await collateral.registerFILCustodyAddr("cid_custody_FIL_1", accounts[1]);
    await collateral.registerFILCustodyAddr("cid_custody_FIL_2", accounts[2]);

    // Collateralize test
    await printCol(collateral, accounts[2], "collateral state before upSizeETH");
    await collateral.upSizeETH({
      from: accounts[2],
      value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
      // value: 2000, // 2000 ETH can cover about 24400 FIL
    });
    await printCol(collateral, accounts[0], "collateral state after upSizeETH for accounts[0]");
    await printCol(collateral, accounts[1], "collateral state after upSizeETH for accounts[1]");
    await printCol(collateral, accounts[2], "collateral state after upSizeETH for accounts[2]");

    /* FIL Loan Execution Test */

    let maker = accounts[0];
    let taker = accounts[2];
    let item, loanId, beforeLoan, afterLoan, res;

    // maker LEND FIL
    item = Object.values(sample.Loan[0]);
    deal = [maker, ...item]; // maker is FIL lender
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0; // available from event
    await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, maker, taker, loanId, "makeLoanDeal");

    await loan.confirmPayment(maker, taker, ...item, loanId, {from: taker}); // taker is borrower
    await printState(loan, collateral, maker, taker, loanId, "confirmPayment");

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log("Loan amt before", beforeLoan.amt, "after", afterLoan.amt);
    await printSched(loan, maker, loanId);

    // maker BORROW FIL
    // console.log();
    // item = Object.values(sample.Loan[2]);
    // deal = [maker, ...item]; // maker is FIL borrower
    // beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    // loanId = 1;
    // await loan.makeLoanDeal(...deal, {from: taker});
    // await printState(loan, collateral, maker, maker, loanId, 'makeLoanDeal');

    // // upsize collateral with lent FIL on maker
    // // await collateral.upSizeFIL(1000, {from: taker});
    // // await collateral.upSizeFIL(14001, { from: taker });
    // // await printCol(collateral, taker, 'collateral upsized with initial swap notional');

    // await loan.confirmPayment(maker, maker, ...item, loanId, {from: maker}); // maker is FIL borrower
    // await printState(loan, collateral, maker, maker, loanId, 'confirmPayment');

    // afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    // console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);
    // await printSched(loan, maker, loanId);

    // // maker BORROW FIL
    // console.log();
    // item = Object.values(sample.Loan[2]);
    // deal = [maker, ...item]; // maker is FIL borrower
    // beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    // loanId = 1;
    // await loan.makeLoanDeal(...deal, {from: taker});
    // await printState(loan, collateral, maker, maker, loanId, 'makeLoanDeal');

    // await loan.confirmPayment(maker, maker, ...item, loanId, {from: maker}); // maker is FIL borrower
    // await printState(loan, collateral, maker, maker, loanId, 'confirmPayment');

    // afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    // console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);
    // await printSched(loan, maker, loanId);

    /* USDC Loan Execution Test */

    // TODO
    // 1. make loan and check col/loan state
    // loan.makeLoanDeal
    // printCol, printLoan
    // loan.confirmUSDCPayment
    // printCol, printLoan

    /* Swap prep */
    // upsize collateral with lent FIL on maker
    // await collateral.upSizeETH({value: 820 , from: taker}); // TODO - fix wei to ETH
    await collateral.upSizeFIL(10000, {from: taker});
    await printCol(collateral, taker, "collateral upsized with initial swap notional");

    // maker BORROW USDC
    console.log();
    item = Object.values(sample.Loan[1]);

    deal = [maker, ...item]; // maker is USDC borrower
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    // loanId = 0;
    loanId = 1; // USDC loan from constants.js/sample
    // loanId = 2;

    await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, maker, maker, loanId, "makeLoanDeal");

    await loan.confirmPayment(maker, maker, ...item, loanId, {from: maker}); // maker is USDC borrower
    await printState(loan, collateral, maker, maker, loanId, "confirmPayment");

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log("Loan amt before", beforeLoan.amt, "after", afterLoan.amt);
    await printSched(loan, maker, loanId);

    /* Swap Execution Test */

    // 1. make swap and check col/loan state
    // lendItem = getOneItem()
    // borrowItem = getOneItem()
    // swap.makeSwapDeal(lendItem, borrowItem, {from: accounts[2]})
    // 2. check swap schedule

    let loan0 = await loan.getLoanItem(0, {from: maker});
    let loan1 = await loan.getLoanItem(1, {from: maker});

    console.log("==");
    await loan.updateAllPV();
    console.log("loan 0 FIL LEND is", loan0);
    console.log("loan 1 USDC BORROW is", loan1);

    callback(0);
  } catch (error) {
    console.error(error);
    callback(1);
  }
};
