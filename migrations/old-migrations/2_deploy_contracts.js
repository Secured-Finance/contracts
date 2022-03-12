const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');

// 0) set up owner address and priv key in .env
// 1) truffle compile --all
// 2) truffle migrate --network ropsten
// module.exports = function (deployer, network, accounts) {
//   deployer.then(async () => {
//     const [owner, alice, bob, carol] = accounts;
//     const moneyMarket = await deployer.deploy(MoneyMarket);
//     const fxMarket = await deployer.deploy(FXMarket);
//     const collateral = await deployer.deploy(Collateral, moneyMarket.address, fxMarket.address);
//     const loan = await deployer.deploy(Loan, moneyMarket.address, fxMarket.address, collateral.address);
//     await collateral.setLoanAddr(loan.address);
//     await moneyMarket.setColAddr(collateral.address);

//     console.log('Network is', network);
//     console.log();
//     console.log('moneyMarket addr is', moneyMarket.address);
//     console.log('fxMarket    addr is', fxMarket.address);
//     console.log('collateral  addr is', collateral.address);
//     console.log('loan        addr is', loan.address);
//     console.log('owner       addr is', owner);
//     console.log();
//     console.log('alice       addr is', alice);
//     console.log('bob         addr is', bob);
//     console.log('carol       addr is', carol);
//     console.log();
//   });
// };

// for testing
const { Side, Ccy, CcyPair, Term, LoanState, ColState, sample } =
  require('../../test-utils').constants;
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require('../../test-utils/src/helper');
const { emitted, reverted, notEmitted, equal, notEqual, isTrue, ok } =
  require('../../test-utils').assert;

/* Helper */
const val = (obj) => {
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

const getDate = async () => {
  const currentTime = await getLatestTimestamp();
  return toDate(currentTime);
};

const expectEvent = async (res, eventName, msg) => {
  if (!msg) return await emitted(res, eventName);
  emitted(res, eventName, (ev) => {
    Object.keys(msg).forEach((key) => {
      equal(msg[key], String(ev[key]));
    });
    return true;
  });
};

// const expectRevert = reverted;

// 1) truffle compile (terminal 1)
// 2) truffle develop (terminal 1)
// 3) truffle migrate --reset (terminal 2)
module.exports = function (deployer, network, accounts) {
  const [owner, alice, bob, carol] = accounts;
  const users = [alice, bob, carol]; // without owner

  let snapshotId;
  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;

  const showBalances = async () => {
    console.log('owner', await web3.eth.getBalance(owner));
    console.log('alice', await web3.eth.getBalance(alice));
    console.log('bob  ', await web3.eth.getBalance(bob));
    console.log('carol', await web3.eth.getBalance(carol));
  };

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
    await collateral.setLoanAddr(loan.address);
    await moneyMarket.setColAddr(collateral.address);

    // Deployed
    const moneyMarket = await MoneyMarket.deployed();
    const fxMarket = await FXMarket.deployed();
    const collateral = await Collateral.deployed();
    const loan = await Collateral.deployed();

    console.log('Network is', network);
    console.log();
    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket    addr is', fxMarket.address);
    console.log('collateral  addr is', collateral.address);
    console.log('loan        addr is', loan.address);
    console.log('owner       addr is', owner);
    console.log();
    console.log('alice       addr is', alice);
    console.log('bob         addr is', bob);
    console.log('carol       addr is', carol);
    console.log();

    /*
     * NOTE: If you encountera revert with 'Collateral book not set yet',
     *       please try to init sample data one-by-one block
     */

    // // Init Collateral
    // await sample.Collateral.forEach(async (item, index) => {
    //   let res = await collateral.setColBook(...val(item), {
    //     from: users[index],
    //     // value: 0,
    //     value: 100000,
    //   });
    //   await expectEvent(res, 'SetColBook', {addr: users[index]});
    // });

    // // Init FX
    // await sample.FXMarket.forEach(async (item) => {
    //   let res = await fxMarket.setFXBook(...val(item), {from: alice});
    //   await expectEvent(res, 'SetFXBook', {addr: alice});
    // });

    // // Init MoneyMarket
    // {
    //   const [item0, item1, item2, item3, item4] = sample.MoneyMarket;
    //   let res0 = await moneyMarket.setMoneyMarketBook(...val(item0), {from: alice});
    //   let res1 = await moneyMarket.setMoneyMarketBook(...val(item1), {from: alice});
    //   let res2 = await moneyMarket.setMoneyMarketBook(...val(item2), {from: bob});
    //   let res3 = await moneyMarket.setMoneyMarketBook(...val(item3), {from: carol});
    //   let res4 = await moneyMarket.setMoneyMarketBook(...val(item4), {from: alice});
    //   await expectEvent(res0, 'SetMoneyMarketBook', {addr: alice});
    //   await expectEvent(res1, 'SetMoneyMarketBook', {addr: alice});
    //   await expectEvent(res2, 'SetMoneyMarketBook', {addr: bob});
    //   await expectEvent(res3, 'SetMoneyMarketBook', {addr: carol});
    //   await expectEvent(res4, 'SetMoneyMarketBook', {addr: alice});
    //   await printCol(collateral, alice, 'collateral state for alice after setMoneyMarketBook');
    //   await printCol(collateral, bob, 'collateral state for bob after setMoneyMarketBook');
    //   await printCol(collateral, carol, 'collateral state for carol after setMoneyMarketBook');
    // }

    // // Init FIL custody addr
    // {
    //   let res0 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_0'), users[0]);
    //   let res1 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_1'), users[1]);
    //   let res2 = await collateral.registerFILCustodyAddr(web3.utils.asciiToHex('cid_custody_FIL_2'), users[2]);
    //   await expectEvent(res0, 'RegisterFILCustodyAddr', {addr: users[0]});
    //   await expectEvent(res1, 'RegisterFILCustodyAddr', {addr: users[1]});
    //   await expectEvent(res2, 'RegisterFILCustodyAddr', {addr: users[2]});
    // }

    // FIL Loan Execution
    // {
    //   let maker = alice; // FIL lender
    //   let taker = carol; // FIL borrower
    //   let item, loanId, beforeLoan, afterLoan;

    //   item = sample.Loan[0];
    //   deal = [maker, ...val(item)]; // maker is FIL lender

    //   beforeLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    //   loanId = 0; // available from event
    //   let res = await loan.makeLoanDeal(...deal, {from: taker});
    //   await printState(loan, collateral, maker, taker, loanId, '[makeLoanDeal]');
    //   console.log('deal item is', item);
    //   await expectEvent(res, 'MakeLoanDeal', {
    //     makerAddr: maker,
    //     side: String(item.side),
    //     ccy: String(item.ccy),
    //     term: String(item.term),
    //     amt: String(item.amt),
    //     loanId: String(loanId),
    //   });
    //   // lender - notifyPayment with txHash
    //   const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    //   await loan.notifyPayment(maker, taker, ...val(item), loanId, txHash, {from: maker});
    //   // borrower check -> confirmPayment to ensure finality
    //   await loan.confirmPayment(maker, taker, ...val(item), loanId, txHash, {from: taker});
    //   await printState(loan, collateral, maker, taker, loanId, '[confirmPayment]');

    //   afterLoan = await moneyMarket.getOneItem(...deal.slice(0, 4));
    //   console.log('Loan amt before', beforeLoan.amt, 'after', afterLoan.amt, '\n');
    //   await printSched(loan, maker, loanId);
    // }
  });
};
