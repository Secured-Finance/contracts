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
    'PARTIAL_LIQUIDATION',
    'LIQUIDATION',
  ];
  console.log(msg);
  console.log(
    `\tamtETH ${book.amtETH}\tamtFIL ${book.amtFIL}\tamtFILValue ${book.amtFILValue}`,
  );
  console.log(
    `\tuseETH ${book.inuseETH}\tuseFIL ${book.inuseFIL}\tuseFILValue ${book.inuseFILValue}`,
  );
  console.log(`\tcoverage ${book.coverage}%\tstate ${states[book.state]}\n`);
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

module.exports = {
  toDate, printDate, printNum, printNumStr, printCol, printLoan
}