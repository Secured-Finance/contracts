// helper to convert timestamp to human readable date
const toDate = (timestamp) => {
  const dateObject = new Date(timestamp * 1000);
  return dateObject.toLocaleString();
};

// helper to print timestamp array
const printDate = (title, arr) => {
  let rv = [];
  arr.forEach((element) => {
    if (element > 0) rv.push(toDate(element));
  });
  console.log(title, rv);
};

const printNumStr = (title, arr) => {
  let rv = [];
  arr.forEach((element) => {
    rv.push(Number(element));
  });
  console.log(title, rv.toString());
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
    'LIQUIDATION_IN_PROGRESS',
    'LIQUIDATION',
  ];
  console.log(msg);
  console.log(`\tamtETH  ${book.colAmtETH}\tuseETH  ${book.inuseETH}`);
  console.log(
    `\tamtFIL  ${book.colAmtFIL}\tuseFIL  ${book.inuseFIL}\tuseFILValue  ${book.inuseFILValue}`,
  );
  console.log(
    `\tamtUSDC ${book.colAmtUSDC}\tuseUSDC ${book.inuseUSDC}\tuseUSDCValue ${book.inuseUSDCValue}`,
  );
  console.log(`\tcoverage ${book.coverage}%\tcolState ${states[book.state]}\n`);
};

const printLoan = async (loan, lender, loanId, msg) => {
  let book = await loan.getOneBook(lender);
  let item = book.loans[loanId];
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
    `\tloan ${item.amt}\trate ${item.rate / 100}% \tloanState ${
      states[item.state]
    }`,
  );
};

const printState = async (
  loan,
  col,
  lender,
  borrower,
  loanId,
  loanMsg,
  colMsg,
) => {
  console.log();
  await printLoan(loan, lender, loanId, loanMsg);
  await printCol(col, borrower, colMsg ? colMsg : '    COLLATERAL:');
};

const printSched = async (loan, makerAddr, loanId) => {
  let book = await loan.getOneBook(makerAddr);
  let loanItem = book.loans[loanId];
  printDate('Notice ', loanItem.schedule.notices);
  printDate('Payment', loanItem.schedule.payments);
  let amts = '';
  loanItem.schedule.amounts.forEach((amt) => {
    if (amt > 0) amts += ' ' + String(amt);
  });
  console.log('Amounts', amts);
};

const toDateTime = (timestamp) => {
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    // hour: "numeric",
    // minute: "numeric",
    // second: "numeric",
    hour12: false,
    timeZone: 'UTC',
    // timeZone: "Asia/Bangkok",
  };
  const dateObject = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat('default', options).format(dateObject);
};

const Side = ['LENDERS', 'BORROWERS'];
const Ccy = ['ETH', 'FIL', 'USDC'];
const Term = ['3m', '6m', '1y', '2y', '3y', '5y'];
const s = (addr) => addr.slice(0, 5);
const t = (term) => Term[term];

const printMoneyMkt = (book) => {
  if (!book.isValue) {
    console.log('book is not value');
    return;
  }
  for (let side = 0; side < Side.length; side++) {
    console.log(`[${Side[side]}]`);
    for (let ccy = 0; ccy < Ccy.length; ccy++) {
      console.log(`    [${Ccy[ccy]}]`);
      for (let term = 0; term < Term.length; term++) {
        let item = book[side][ccy][term];
        if (!item.isAvailable) continue;
        console.log(
          `\t${t(term)} ${item.amt} ${item.rate / 100}% ${toDateTime(
            item.goodtil,
          )} ${s(item.addr)}`,
        );
      }
    }
  }
  console.log();
};

const printDf = (arr) => {
  arr.forEach((df, index) => {
    console.log(Ccy[index]);
    console.log(
      `${df.df3m} ${df.df6m} ${df.df1y} ${df.df2y} ${df.df3y} ${df.df4y} ${df.df5y}`,
    );
  });
};

const printRates = (arr) => {
  arr.forEach((rate, index) => {
    console.log(Ccy[index]);
    printNum(rate);
  });
};

module.exports = {
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
};
