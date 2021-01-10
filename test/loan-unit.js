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
  advanceTime,
  takeSnapshot,
  revertToSnapshot,
  getLatestTimestamp,
  getTimestampPlusDays,
} = require('../test-utils').time;
const {emitted, reverted, notEmitted, equal, notEqual, isTrue, ok} = require('../test-utils').assert;

const val = (obj) => {
  if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
  return Object.values(obj);
};

const getDate = async () => {
  const currentTime = await Date.now();
  return toDate(currentTime);
};

contract('Loan Unit Tests', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  beforeEach(async () => {
    const snapShot = await takeSnapshot();
    snapshotId = snapShot['result'];
  });

  afterEach(async () => {
    await revertToSnapshot(snapshotId);
  });

  before('deploy Loan', async () => {
    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: owner});
    await moneyMarket.setColAddr(collateral.address);
  });

  describe('Test Loan', async () => {
    it('say hello', async () => {
      console.log('hello');
    });
  });
});
