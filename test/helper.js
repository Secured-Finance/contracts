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
  let states = ["EMPTY", "AVAILABLE", "IN_USE", "MARGIN_CALL", "PARTIAL_LIQUIDATION", "LIQUIDATION"];
  console.log(msg);
  console.log(`\tamtETH  ${book.amtETH}\tuseETH  ${book.inuseETH}`);
  console.log(`\tamtFIL  ${book.amtFIL}\tuseFIL  ${book.inuseFIL}\tuseFILValue  ${book.inuseFILValue}`);
  console.log(`\tamtUSDC ${book.amtUSDC}\tuseUSDC ${book.inuseUSDC}\tuseUSDCValue ${book.inuseUSDCValue}`);
  console.log(`\tcoverage ${book.coverage}%\tcolState ${states[book.state]}\n`);
};

const printLoan = async (loan, makerAddr, loanId, msg) => {
  let book = await loan.getOneBook(makerAddr);
  let item = book.loans[loanId];
  let states = ["REGISTERED", "WORKING", "DUE", "PAST_DUE", "CLOSED", "TERMINATED"];
  if (msg.length > 0) console.log(msg);
  console.log(`\tloan ${item.amt}\trate ${item.rate / 100}% \tloanState ${states[item.state]}\n`);
};

const printState = async (loan, col, loanMaker, colUser, loanId, loanMsg, colMsg) => {
  await printLoan(loan, loanMaker, loanId, loanMsg);
  await printCol(col, colUser, colMsg ? colMsg : "collateral state");
};

const printSched = async (loan, makerAddr, loanId) => {
  let book = await loan.getOneBook(makerAddr);
  let loanItem = book.loans[loanId];
  printDate("Notice ", loanItem.schedule.notices);
  printDate("Payment", loanItem.schedule.payments);
  let amts = "";
  loanItem.schedule.amounts.forEach((amt) => {
    if (amt > 0) amts += " " + String(amt);
  });
  console.log("Amounts", amts);
};

const Side = ["LEND", "BORROW"];
const Ccy = ["ETH", "FIL", "USDC"];
const Term = ["3m", "6m", "1y", "2y", "3y", "5y"];
const s = (addr) => addr.slice(0, 8);
const t = (term) => Term[term];

const printMoneyMkt = (book) => {
  for (let side = 0; side < Side.length; side++) {
    console.log(`[${Side[side]}]`);
    for (let ccy = 0; ccy < Ccy.length; ccy++) {
      console.log(`    [${Ccy[ccy]}]`);
      for (let term = 0; term < Term.length; term++) {
        let item = book[side][ccy][term];
        console.log(`\t${t(term)} ${item.amt} ${item.rate / 100}%`);
      }
    }
  }
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
};
