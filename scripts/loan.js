const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const {Side, Ccy, Term, sample} = require('../test/constants');
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require('../test/helper');

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
    const collateral = await Collateral.new(
      moneyMarket.address,
      fxMarket.address,
    );
    const loan = await Loan.new(
      moneyMarket.address,
      fxMarket.address,
      collateral.address,
    );

    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket addr is', fxMarket.address);
    console.log('collateral addr is', collateral.address);
    console.log('loan addr is', loan.address);
    console.log('\n');

    // Init MoneyMarket with sample data
    await moneyMarket.setMoneyMarketBook(
      ...Object.values(sample.MoneyMarket[0]),
    );
    await moneyMarket.setMoneyMarketBook(
      ...Object.values(sample.MoneyMarket[1]),
    );
    await moneyMarket.setMoneyMarketBook(
      ...Object.values(sample.MoneyMarket[2]),
    );
    let midRates = await moneyMarket.getMidRates();
    console.log('Loan midRates is');
    console.log('FIL ', midRates[0].join(' '));
    console.log('ETH ', midRates[1].join(' '));
    console.log('USDC', midRates[2].join(' '), '\n');

    // discount factor test
    let df = await moneyMarket.getDiscountFactors();
    console.log('DF is');
    console.log('FIL ', df[0].join(' '));
    console.log('ETH ', df[1].join(' '));
    console.log('USDC', df[2].join(' '), '\n');

    // Init FXMarket with sample data
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[0]));
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[1]));
    await fxMarket.setFXBook(...Object.values(sample.FXMarket[2]));
    midRates = await fxMarket.getMidRates();
    console.log('FX midRates is', midRates.join(' '), '\n');

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
    await collateral.registerFILCustodyAddr('cid_custody_FIL_0', accounts[0]);
    await collateral.registerFILCustodyAddr('cid_custody_FIL_1', accounts[1]);
    await collateral.registerFILCustodyAddr('cid_custody_FIL_2', accounts[2]);

    // Collateralize test
    await printCol(
      collateral,
      accounts[2],
      'collateral state before upSizeETH',
    );
    await collateral.upSizeETH({
      from: accounts[2],
      value: 2000, // 2000 ETH can cover about 24400 FIL
    });
    await printCol(
      collateral,
      accounts[0],
      'collateral state after upSizeETH for accounts[0]',
    );
    await printCol(
      collateral,
      accounts[1],
      'collateral state after upSizeETH for accounts[1]',
    );
    await printCol(
      collateral,
      accounts[2],
      'collateral state after upSizeETH for accounts[2]',
    );

    /* FIL Loan Execution Test */

    let maker = accounts[0];
    let taker = accounts[2];
    let item, loanId, beforeLoan, afterLoan, res;

    // // maker LEND FIL
    item = Object.values(sample.Loan[0]);
    deal = [maker, ...item]; // maker is FIL lender
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0; // available from event
    await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, maker, taker, loanId, 'makeLoanDeal');

    await loan.confirmPayment(maker, taker, ...item, loanId, {from: taker}); // taker is borrower
    await printState(loan, collateral, maker, taker, loanId, 'confirmPayment');

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);
    await printSched(loan, maker, loanId);

    // maker BORROW FIL
    console.log();
    item = Object.values(sample.Loan[2]);
    deal = [maker, ...item]; // maker is FIL borrower
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 1;
    await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, maker, maker, loanId, 'makeLoanDeal');

    await loan.confirmPayment(maker, maker, ...item, loanId, {from: maker}); // maker is FIL borrower
    await printState(loan, collateral, maker, maker, loanId, 'confirmPayment');

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);
    await printSched(loan, maker, loanId);

    /* USDC Loan Execution Test */

    // TODO
    // 1. make loan and check col/loan state
    // loan.makeLoanDeal
    // printCol, printLoan
    // loan.confirmUSDCPayment
    // printCol, printLoan

    // // maker BORROW USDC
    // console.log();
    // item = Object.values(sample.Loan[1]);
    // deal = [maker, ...item]; // maker is USDC borrower
    // beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    // // loanId = 0;
    // // loanId = 1;
    // loanId = 2;
    // await loan.makeLoanDeal(...deal, {from: taker});
    // await printState(loan, collateral, maker, maker, loanId, 'makeLoanDeal');

    // await loan.confirmPayment(maker, maker, ...item, loanId, {from: maker}); // maker is USDC borrower
    // await printState(loan, collateral, maker, maker, loanId, 'confirmPayment');

    // afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    // console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);
    // await printSched(loan, maker, loanId);

    /* Swap Execution Test */

    // 1. make swap and check col/loan state
    // lendItem = getOneItem()
    // borrowItem = getOneItem()
    // swap.makeSwapDeal(lendItem, borrowItem, {from: accounts[2]})
    // 2. check swap schedule

    callback(0);
  } catch (error) {
    console.error(error);
    callback(1);
  }
};

// const sample = {
//   MoneyMarket: {
//     ccy: 1,
//     lenders: [
//       [0, 100000, 400],
//       [1, 110000, 500],
//       [2, 120000, 700],
//       [3, 130000, 800],
//       [4, 140000, 900],
//       [5, 150000, 1000],
//     ],
//     borrowers: [
//       [0, 100000, 300],
//       [1, 110000, 400],
//       [2, 120000, 600],
//       [3, 130000, 700],
//       [4, 140000, 800],
//       [5, 150000, 900],
//     ],
//     // lenders: [
//     //   // [term, amt, rate] (1% = 100bps)
//     //   [0, 100000, 500], // [_3m, 100000FIL, 500bps is 5%]
//     //   [1, 110000, 600], // [_6m, 110000FIL, 600bps is 6%]
//     //   [2, 120000, 900],
//     //   [3, 130000, 1200],
//     //   [4, 140000, 1500],
//     //   [5, 150000, 1800], // [_5y, 150000FIL, 1800bps is 18%]
//     // ],
//     // borrowers: [
//     //   [0, 100000, 400], // [_3m, 100000FIL, 400bps is 4%]
//     //   [1, 110000, 500], // [_6m, 110000FIL, 500bps is 5%]
//     //   [2, 120000, 800],
//     //   [3, 130000, 1000],
//     //   [4, 140000, 1300],
//     //   [5, 150000, 1600], // [_5y, 150000FIL, 1600bps is 16%]
//     // ],
//     effectiveSec: 36000, // 10 hrs
//   },
//   FXMarket: {
//     pair: 0, // FILETH
//     offerInput: [0, 1, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
//     bidInput: [1, 0, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
//     effectiveSec: 36000,
//   },
//   Collateral: [
//     {
//       id: 'did:sample_0',
//       addrFIL: 'cid_FIL_0',
//     },
//     {
//       id: 'did:sample_1',
//       addrFIL: 'cid_FIL_1',
//     },
//     {
//       id: 'did:sample_2',
//       addrFIL: 'cid_FIL_2',
//     },
//   ],
//   Loan: {
//     // makerAddr: accounts[0],
//     // side: 1, // BORROW
//     side: 0, // LEND
//     ccy: 1, // FIL
//     term: 5, // _5y
//     amt: 150000 - 9999,
//   },
// };

// // helper to convert timestamp to human readable date
// const toDate = (timestamp) => {
//   const dateObject = new Date(timestamp * 1000);
//   return dateObject.toLocaleString();
// };

// // helper to print timestamp array
// const printDate = (arr) => {
//   let rv = [];
//   arr.forEach((element) => {
//     rv.push(toDate(element));
//   });
//   console.log(rv);
// };

// const printNum = (arr) => {
//   let rv = [];
//   arr.forEach((element) => {
//     rv.push(Number(element));
//   });
//   console.log(rv);
// };

// const printCol = async (col, addr, msg) => {
//   let book = await col.getOneBook(addr);
//   let states = [
//     'EMPTY',
//     'AVAILABLE',
//     'IN_USE',
//     'MARGIN_CALL',
//     'PARTIAL_LIQUIDATION',
//     'LIQUIDATION',
//   ];
//   console.log(msg);
//   console.log(
//     `\tamtETH ${book.amtETH}\tamtFIL ${book.amtFIL}\tamtFILVale ${book.amtFILValue}`,
//   );
//   console.log(
//     `\tuseETH ${book.inuseETH}\tuseFIL ${book.inuseFIL}\tuseFILVale ${book.inuseFILValue}`,
//   );
//   console.log(`\tcoverage ${book.coverage}\tstate ${states[book.state]}\n`);
// };

// const printLoan = async (loan, addr, msg) => {
//   let book = await loan.getOneBook(addr);
//   let item = book.loans[0];
//   let states = [
//     'REGISTERED',
//     'WORKING',
//     'DUE',
//     'PAST_DUE',
//     'CLOSED',
//     'TERMINATED',
//   ];
//   if (msg.length > 0) console.log(msg);
//   console.log(
//     `\tloan ${item.amt}\trate ${item.rate / 100}%\tstate ${
//       states[item.state]
//     }\n`,
//   );
// };
