const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');

// 1) truffle compile
// 2) truffle develop
// 3) migrate --reset
module.exports = function (deployer, network, accounts) {
  deployer.then(async () => {
    const moneyMarket = await deployer.deploy(MoneyMarket);
    const fxMarket = await deployer.deploy(FXMarket);
    const collateral = await deployer.deploy(
      Collateral,
      moneyMarket.address,
      fxMarket.address,
    );
    const loan = await deployer.deploy(
      Loan,
      moneyMarket.address,
      fxMarket.address,
      collateral.address,
    );
    await collateral.setLoanAddr(loan.address); // set Loan address

    // // Deployed
    // const moneyMarket = await MoneyMarket.deployed();
    // const fxMarket = await FXMarket.deployed();
    // const collateral = await Collateral.deployed();
    // const loan = await Collateral.deployed();

    // console.log('moneyMarket addr is', moneyMarket.address);
    // console.log('fxMarket addr is', fxMarket.address);
    // console.log('collateral addr is', collateral.address);
    // console.log('loan addr is', loan.address);
    // console.log('\n');

    // // Init MoneyMarket with sample data
    // let input = sample.MoneyMarket;
    // await moneyMarket.setMoneyMarketBook(
    //   input.ccy,
    //   input.lenders,
    //   input.borrowers,
    //   input.effectiveSec,
    // );

    // // Init FXMarket with sample data
    // input = sample.FXMarket;
    // await fxMarket.setFXBook(
    //   input.pair,
    //   input.offerInput,
    //   input.bidInput,
    //   input.effectiveSec,
    // );

    // // Init Collateral with sample data
    // input = sample.Collateral;
    // await collateral.setColBook(input[0].id, input[0].addrFIL, {
    //   from: accounts[0],
    //   value: 10000,
    // });
    // await collateral.setColBook(input[1].id, input[1].addrFIL, {
    //   from: accounts[1],
    //   value: 10000,
    // });
    // await collateral.setColBook(input[2].id, input[2].addrFIL, {
    //   from: accounts[2],
    // });
    // await collateral.registerFILCustodyAddr('cid_custody_FIL_0', accounts[0]);
    // await collateral.registerFILCustodyAddr('cid_custody_FIL_1', accounts[1]);
    // await collateral.registerFILCustodyAddr('cid_custody_FIL_2', accounts[2]);

    // /* Loan Execution Test */

    // // Collateralize test
    // await printCol(collateral, accounts[2], 'Registered');
    // await collateral.upSizeETH({
    //   from: accounts[2],
    //   value: 20000, // 20000 ETH can cover about 244000 FIL
    //   // value: 1000000000000000000, // 1 ETH in wei
    // });
    // await printCol(collateral, accounts[2], 'upSizeETH (ETH 21200 added)');

    // // makeLoanDeal test
    // input = sample.Loan;
    // let beforeLoan = await moneyMarket.getOneItem(
    //   input.makerAddr,
    //   input.side,
    //   input.ccy,
    //   input.term,
    // );

    // // Init Loan with sample data
    // let taker = accounts[2];
    // await loan.makeLoanDeal(
    //   input.makerAddr,
    //   input.side,
    //   input.ccy,
    //   input.term,
    //   input.amt,
    //   {
    //     from: taker,
    //   },
    // );
    // await printCol(
    //   collateral,
    //   accounts[2],
    //   'makeLoanDeal (borrow FIL 140001, FILETH is 0.082)',
    // );
    // await printLoan(loan, accounts[2], '');

    // // confirm FIL payment test
    // await loan.confirmFILPayment(0, {
    //   from: accounts[2],
    // });

    // await printCol(
    //   collateral,
    //   accounts[2],
    //   'confirmFILPayment (coverage 174%)',
    // );
    // await printLoan(loan, accounts[2], '');

    // let afterLoan = await moneyMarket.getOneItem(
    //   input.makerAddr,
    //   input.side,
    //   input.ccy,
    //   input.term,
    // );
    // console.log(
    //   'FIL loan market before',
    //   beforeLoan.amt,
    //   'FIL loan market after',
    //   afterLoan.amt,
    // );

    // // loan item test
    // let book = await loan.getOneBook(taker);
    // let loanItem = book.loans[0];
    // printDate(loanItem.schedule.notices);
    // printDate(loanItem.schedule.payments);
    // console.log(loanItem.schedule.amounts);

    // // discount factor test
    // let df = await moneyMarket.getDiscountFactors();
    // printNum(df[0]);
    // printNum(df[1]);
  });

  const sample = {
    MoneyMarket: {
      ccy: 1,
      lenders: [
        [0, 100000, 400],
        [1, 110000, 500],
        [2, 120000, 700],
        [3, 130000, 800],
        [4, 140000, 900],
        [5, 150000, 1000],
      ],
      borrowers: [
        [0, 100000, 300],
        [1, 110000, 400],
        [2, 120000, 600],
        [3, 130000, 700],
        [4, 140000, 800],
        [5, 150000, 900],
      ],
      // lenders: [
      //   // [term, amt, rate] (1% = 100bps)
      //   [0, 100000, 500], // [_3m, 100000FIL, 500bps is 5%]
      //   [1, 110000, 600], // [_6m, 110000FIL, 600bps is 6%]
      //   [2, 120000, 900],
      //   [3, 130000, 1200],
      //   [4, 140000, 1500],
      //   [5, 150000, 1800], // [_5y, 150000FIL, 1800bps is 18%]
      // ],
      // borrowers: [
      //   [0, 100000, 400], // [_3m, 100000FIL, 400bps is 4%]
      //   [1, 110000, 500], // [_6m, 110000FIL, 500bps is 5%]
      //   [2, 120000, 800],
      //   [3, 130000, 1000],
      //   [4, 140000, 1300],
      //   [5, 150000, 1600], // [_5y, 150000FIL, 1600bps is 16%]
      // ],
      effectiveSec: 36000, // 10 hrs
    },
    FXMarket: {
      pair: 0, // FILETH
      offerInput: [0, 1, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
      bidInput: [1, 0, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
      effectiveSec: 36000,
    },
    Collateral: [
      {
        id: 'did:sample_0',
        addrFIL: 'cid_FIL_0',
      },
      {
        id: 'did:sample_1',
        addrFIL: 'cid_FIL_1',
      },
      {
        id: 'did:sample_2',
        addrFIL: 'cid_FIL_2',
      },
    ],
    Loan: {
      makerAddr: accounts[0],
      // side: 1, // BORROW
      side: 0, // LEND
      ccy: 1, // FIL
      term: 5, // _5y
      amt: 150000 - 9999,
    },
  };
};

// helper to convert timestamp to human readable date
const toDate = (timestamp) => {
  const dateObject = new Date(timestamp * 1000);
  return dateObject.toLocaleString();
};

// helper to print timestamp array
const printDate = (arr) => {
  let rv = [];
  arr.forEach((element) => {
    rv.push(toDate(element));
  });
  console.log(rv);
};

const printNum = (arr) => {
  let rv = [];
  arr.forEach((element) => {
    rv.push(Number(element));
  });
  console.log(rv);
};

const printCol = async (col, addr, msg) => {
  let book = await col.getOneBook(addr);
  let states = [
    'EMPTY',
    'AVAILABLE',
    'IN_USE',
    'MARGIN_CALL',
    'PARTIAL_LIQUIDATION',
    'LIQUIDATION',
  ];
  console.log(msg);
  console.log(
    `\tamtETH ${book.amtETH}\tamtFIL ${book.amtFIL}\tamtFILVale ${book.amtFILValue}`,
  );
  console.log(
    `\tuseETH ${book.inuseETH}\tuseFIL ${book.inuseFIL}\tuseFILVale ${book.inuseFILValue}`,
  );
  console.log(`\tcoverage ${book.coverage}\tstate ${states[book.state]}\n`);
};

const printLoan = async (loan, addr, msg) => {
  let book = await loan.getOneBook(addr);
  let item = book.loans[0];
  let states = [
    'REGISTERED',
    'WORKING',
    'DUE',
    'PAST_DUE',
    'CLOSED',
    'TERMINATED',
  ];
  if (msg.length > 0) console.log(msg);
  console.log(
    `\tloan ${item.amt}\trate ${item.rate / 100}%\tstate ${
      states[item.state]
    }\n`,
  );
};
