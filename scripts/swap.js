const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const {Side, Ccy, CcyPair, Term, LoanState, ColState, sample} = require('../test-utils').constants;
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require('../test-utils').helper;

const val = (obj) => {
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

module.exports = async function main(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    console.log(accounts);
    const [owner, alice, bob, carol] = accounts;

    // const moneyMarket = await MoneyMarket.deployed();
    // const fxMarket = await FXMarket.deployed();
    // const collateral = await Collateral.deployed();
    // const loan = await Loan.deployed();

    const moneyMarket = await MoneyMarket.new();
    const fxMarket = await FXMarket.new();
    const collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: accounts[0]});
    await moneyMarket.setColAddr(collateral.address);

    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket addr is', fxMarket.address);
    console.log('collateral addr is', collateral.address);
    console.log('loan addr is', loan.address);
    console.log('\n');

    // Init Users with Collateral
    // input = sample.Collateral;
    // await collateral.setColBook(...val(input[0]), {
    //   from: accounts[0],
    //   value: 10000,
    // });
    // await collateral.setColBook(...val(input[1]), {
    //   from: accounts[1],
    //   value: 10000,
    // });
    // await collateral.setColBook(...val(input[2]), {
    //   from: accounts[2],
    // });
    sample.Collateral.forEach(async (item, index) => {
      let res = await collateral.setColBook(...val(item), {
        from: accounts[index],
        // value: 0,
        value: 100000,
      });
    });

    await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_0'), accounts[0]);
    await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_1'), accounts[1]);
    await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_2'), accounts[2]);

    // Collateralize test
    await printCol(collateral, accounts[2], 'collateral state before upSizeETH');
    await collateral.upSizeETH({
      from: accounts[2],
      value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
    });
    await printCol(collateral, accounts[2], 'collateral state after upSizeETH for accounts[2]');

    // Init FXMarket with sample data
    sample.FXMarket.forEach(async (item) => {
      let res = await fxMarket.setFXBook(...val(item), {from: accounts[0]});
      expectEvent(res, 'SetFXBook', {addr: alice});
    });
    let midRates = await fxMarket.getMidRates();
    console.log('FX midRates is', midRates.join(' '), '\n');

    // Init MoneyMarket with sample data
    await moneyMarket.setMoneyMarketBook(...val(sample.MoneyMarket[0]));
    await moneyMarket.setMoneyMarketBook(...val(sample.MoneyMarket[1]));
    await moneyMarket.setMoneyMarketBook(...val(sample.MoneyMarket[2]));
    await moneyMarket.setMoneyMarketBook(...val(sample.MoneyMarket[3]));
    await moneyMarket.setMoneyMarketBook(...val(sample.MoneyMarket[4]));
    midRates = await moneyMarket.getMidRates();
    console.log('Loan midRates is');
    console.log('ETH ', midRates[0].join(' '));
    console.log('FIL ', midRates[1].join(' '));
    console.log('USDC', midRates[2].join(' '), '\n');

    // discount factor test
    let df = await moneyMarket.getDiscountFactors();
    console.log('DF is');
    console.log('ETH ', df[0].join(' '));
    console.log('FIL ', df[1].join(' '));
    console.log('USDC', df[2].join(' '), '\n');

    /* FIL <> USDC swap test */
    // 1. FIL loan
    // 2. FIL collatearl upsize
    // 3. USDC loan
    // 4. USDC or ETH collateral upsize

    let maker = accounts[0];
    let taker = accounts[2];
    let item, loanId, beforeLoan, afterLoan, res;

    /* 1. FIL Loan Execution */

    // maker LEND FIL
    item = sample.Loan[0];
    deal = [maker, ...val(item)]; // maker is FIL lender
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0; // available from event
    await loan.makeLoanDeal(...deal, {from: taker});
    // await printState(loan, collateral, maker, taker, loanId, 'makeLoanDeal');

    // await loan.confirmPayment(maker, taker, ...item, loanId, {from: taker}); // taker is borrower
    // await printState(loan, collateral, maker, taker, loanId, 'confirmPayment');

    // lender - notifyPayment with txHash
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker});

    // borrower check -> confirmPayment to ensure finality
    await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker});
    await printState(loan, collateral, maker, taker, loanId, '[confirmPayment]');

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);

    /* 2. Swap notional exchange */
    // upsize taker collateral with FIL from maker
    await collateral.upSizeFIL(10000, txHash, {from: taker});
    await printCol(collateral, taker, 'collateral upsized with FIL Loan');

    console.log('FIL LEND SCHEDULE');
    await printSched(loan, maker, loanId);

    /* 3. USDC Loan Execution */

    // maker BORROW USDC
    console.log();
    item = sample.Loan[1];
    deal = [maker, ...val(item)]; // maker is USDC borrower
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0;
    await loan.makeLoanDeal(...deal, {from: taker});
    await printState(loan, collateral, taker, taker, loanId, 'makeLoanDeal');

    await loan.notifyPayment(taker, maker, ...val(item), loanId, txHash, {from: maker});
    await loan.confirmPayment(taker, maker, ...val(item), loanId, txHash, {from: taker}); // maker is USDC borrower
    await printState(loan, collateral, taker, maker, loanId, 'confirmPayment');

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt);

    /* 4. Swap notional exchange */
    // upsize maker collateral with USDC from taker
    // TODO - upSizeUSDC, for now upSizeETH
    await collateral.upSizeETH({value: 820, from: maker});
    await printCol(collateral, maker, 'collateral upsized with USDC Loan');

    console.log('USDC BORROW SCHEDULE');
    await printSched(loan, maker, loanId);

    /* Swap Execution DONE */
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
