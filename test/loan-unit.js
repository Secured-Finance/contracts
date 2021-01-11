const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const {Side, Ccy, CcyPair, Term, sample} = require('../test-utils').constants;
const {
  toDate,
  printDate,
  printNum,
  printNumStr,
  printCol,
  printLoan,
  printState,
  printSched,
} = require('../test-utils/src/helper');
const {
  SEC,
  MIN,
  HOUR,
  DAY,
  SETTLE_GAP,
  NOTICE_GAP,
  YEAR,
  advanceTimeAndBlock,
  takeSnapshot,
  revertToSnapshot,
  getLatestTimestamp,
} = require('../test-utils').time;
const {emitted, reverted, notEmitted, equal, notEqual, isTrue, ok} = require('../test-utils').assert;

const val = (obj) => {
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

const getDate = async () => {
  const currentTime = await getLatestTimestamp();
  return toDate(currentTime);
};

contract('Loan Unit Tests', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;

  before('deploy Loan', async () => {
    let time = await getLatestTimestamp();
    console.log('before    ', toDate(time));

    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: owner});
    await moneyMarket.setColAddr(collateral.address);
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
  });

  describe('Test Loan', async () => {
    it('Init Collateral with sample data', async () => {
      sample.Collateral.forEach(async (item, index) => {
        let res = await collateral.setColBook(...val(item), {
          from: accounts[index],
          // value: 0,
          value: 100000,
        });
        await emitted(res, 'SetColBook');
        // await emitted(res, 'SetColBook', async (ev) => {
        //   equal(ev.addr, accounts[index]);
        //   // console.log('ev is', ev);
        // });
      });
    });
    it('Init with sample FXMarket', async () => {
      sample.FXMarket.forEach(async (item) => {
        let res = await fxMarket.setFXBook(...val(item), {from: alice});
        await emitted(res, 'SetFXBook');
        // await emitted(res, 'SetFXBook', async (ev) => {
        //   equal(ev.addr, alice);
        // });
      });
    });
  });

  describe('Time Dependency Test', async () => {
    beforeEach(async () => {
      let time = await getDate();
      console.log('beforeEach', time);

      const snapShot = await takeSnapshot();
      snapshotId = snapShot['result'];
    });

    afterEach(async () => {
      await revertToSnapshot(snapshotId);

      let time = await getDate();
      console.log('afterEach ', time);
    });

    it('One day forward', async () => {
      await advanceTimeAndBlock(DAY);
      let time = await getDate();
      console.log('test01    ', time);

      console.log('hoge');
    });
    it('Coupon notice and payment', async () => {
      await advanceTimeAndBlock(YEAR - NOTICE_GAP);
      let time = await getDate();
      console.log('notice    ', time);
      await advanceTimeAndBlock(NOTICE_GAP);
      time = await getDate();
      console.log('payment    ', time);

      console.log('hoge hoge');
    });
  });
});
