const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const { Side, Ccy, CcyPair, Term, sample } = require('../test-utils').constants;
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

const getDate = async () => {
  const currentTime = await Date.now();
  return toDate(currentTime);
};

module.exports = async function main(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    console.log(accounts);
    let owner = accounts[0];

    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(
      moneyMarket.address,
      fxMarket.address,
      collateral.address,
    );
    await collateral.setLoanAddr(loan.address, { from: owner });
    await moneyMarket.setColAddr(collateral.address);

    console.log();
    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket    addr is', fxMarket.address);
    console.log('collateral  addr is', collateral.address);
    console.log('loan        addr is', loan.address);

    sample.Collateral.forEach(async (item, index) => {
      let res = await collateral.setColBook(...val(item), {
        from: accounts[index],
        // value: 0,
        value: 100000,
      });
      // expectEvent(res, "SetColBook", {addr: accounts[index]});
    });

    sample.FXMarket.forEach(async (item) => {
      let res = await fxMarket.setFXBook(...val(item), { from: accounts[0] });
      // expectEvent(res, "SetFXBook", {addr: accounts[0]});
    });

    await printCol(
      collateral,
      accounts[2],
      'collateral state for carol before upSizeETH',
    );
    let res = await collateral.upSizeETH({
      from: accounts[2],
      value: 1240, // 1240 ETH can cover about 820 ETH = 10000 FIL
    });
    // expectEvent(res, "UpSizeETH", {addr: accounts[2]});
    await printCol(
      collateral,
      accounts[2],
      'collateral state for carol after upSizeETH',
    );

    const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
    // let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: accounts[0]});
    let moneyMarketRes = await moneyMarket.setMoneyMarketBook(...val(item1), {
      from: accounts[0],
    });
    // let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: accounts[1]});
    // let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
    // let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: accounts[0]});
    // expectEvent(res0, "SetMoneyMarketBook", {addr: accounts[0]});
    // expectEvent(moneyMarketRes, "SetMoneyMarketBook", {addr: accounts[0]});
    // expectEvent(res2, "SetMoneyMarketBook", {addr: accounts[1]});
    // expectEvent(res3, "SetMoneyMarketBook", {addr: carol});
    // expectEvent(res4, "SetMoneyMarketBook", {addr: accounts[0]});
    await printCol(
      collateral,
      accounts[0],
      'collateral state for accounts[0] after setMoneyMarketBook',
    );
    // await printCol(collateral, accounts[1], "collateral state for accounts[1] after setMoneyMarketBook");
    // await printCol(collateral, carol, "collateral state for carol after setMoneyMarketBook");

    let collateralRes = await collateral.registerFILCustodyAddr(
      web3.utils.asciiToHex('cid_custody_FIL_0'),
      accounts[0],
    );
    let collateralRes1 = await collateral.registerFILCustodyAddr(
      web3.utils.asciiToHex('cid_custody_FIL_1'),
      accounts[1],
    );
    let collateralRes2 = await collateral.registerFILCustodyAddr(
      web3.utils.asciiToHex('cid_custody_FIL_2'),
      accounts[2],
    );
    // expectEvent(collateralRes, "RegisterFILCustodyAddr", {addr: accounts[0]});
    // expectEvent(collateralRes1, "RegisterFILCustodyAddr", {addr: accounts[1]});
    // expectEvent(collateralRes2, "RegisterFILCustodyAddr", {addr: accounts[2]});

    let maker = accounts[0]; // FIL lender
    let taker = accounts[2]; // FIL borrower
    let item, loanId, beforeLoan, afterLoan;

    // maker LEND FIL
    item = sample.Loan[0];
    deal = [maker, ...val(item)]; // maker is FIL lender
    beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));

    loanId = 0; // available from event
    let loanRes = await loan.makeLoanDeal(...deal, { from: taker });
    await printState(loan, collateral, maker, taker, loanId, '[makeLoanDeal]');

    console.log('deal item is', item);

    // expectEvent(loanRes, "MakeLoanDeal", {
    //   makerAddr: maker,
    //   side: String(item.side),
    //   ccy: String(item.ccy),
    //   term: String(item.term),
    //   amt: String(item.amt),
    //   loanId: String(loanId),
    // });

    // lender - notifyPayment with txHash
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {
      from: maker,
    });

    // borrower check -> confirmPayment to ensure finality
    await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {
      from: taker,
    });
    await printState(
      loan,
      collateral,
      maker,
      taker,
      loanId,
      '[confirmPayment]',
    );

    afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    // expect(Number(beforeLoan.amt) - item.amt).to.equal(Number(afterLoan.amt));

    console.log(
      'Loan amt before',
      beforeLoan.amt,
      'after',
      afterLoan.amt,
      '\n',
    );
    await printSched(loan, maker, loanId);

    {
      let maker = accounts[0]; // FIL lender
      let taker = accounts[2]; // FIL borrower
      let loanId = 0;

      let item, res, midRates;

      await printCol(collateral, taker, 'BEFORE PV drop');
      midRates = await fxMarket.getMidRates();
      console.log('FX midRates is', midRates.join(' '), '\n');

      let book, amtWithdraw;
      book = await collateral.getOneBook(taker);
      amtWithdraw =
        book.colAmtETH - Math.round((160 * book.colAmtETH) / book.coverage);
      await collateral.withdrawCollaretal(Ccy.ETH, amtWithdraw, {
        from: taker,
      });
      await printCol(collateral, taker, 'PV drop to 160');

      book = await collateral.getOneBook(taker);

      // // col state IN_USE -> MARGINCALL
      // item = {
      //   pair: CcyPair.FILETH,
      //   offerInput: [Ccy.ETH, Ccy.FIL, 8900, 100000],
      //   bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8700],
      //   effectiveSec: 36000,
      // };
      // res = await fxMarket.setFXBook(...val(item), {from: accounts[0]});

      // midRates = await fxMarket.getMidRates();
      // console.log("FX midRates is", midRates.join(" "), "\n");
      // await loan.updateBookPV(maker);
      // // await collateral.updateState(taker);
      // await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 82 to 88`);

      // // col state MARGINCALL -> LIQUIDATION
      // item = {
      //   pair: CcyPair.FILETH,
      //   offerInput: [Ccy.ETH, Ccy.FIL, 10600, 100000],
      //   bidInput: [Ccy.FIL, Ccy.ETH, 100000, 10400],
      //   effectiveSec: 36000,
      // };
      // res = await fxMarket.setFXBook(...val(item), {from: accounts[0]});

      // midRates = await fxMarket.getMidRates();
      // console.log("FX midRates is", midRates.join(" "), "\n");
      // await loan.updateBookPV(maker);
      // // await collateral.updateState(taker);
      // await printState(loan, collateral, maker, taker, loanId, `FX rate changed from 88 to 105`);
    }

    callback(0);
  } catch (error) {
    console.error(error);
    callback(1);
  }
};
