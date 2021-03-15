const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const OrderBook = artifacts.require('OrderBook');
const Loan = artifacts.require('Loan');

const {Side, Ccy, Term, ColState, sample} = require('../test-utils').constants;
const {accounts, defaultSender, web3, provider} = require("@openzeppelin/test-environment");
const {
  toDate,
  printCol,
} = require('../test-utils/src/helper');
const {
  ONE_DAY,
  NOTICE_GAP,
  advanceTimeAndBlock,
  getLatestTimestamp,
} = require('../test-utils').time;
const { emitted, reverted } = require('../test-utils').assert;

/* Helper */
const val = (obj) => {
    if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
    return Object.values(obj);
};  

const getDate = async () => {
  const currentTime = await getLatestTimestamp();
  return toDate(currentTime);
};

const effectiveSec = 60 * 60 * 24 * 14; // 14 days

const expectRevert = reverted;

contract('OrderBook', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const users = [alice, bob, carol]; // without owner

  let snapshotId;
  let moneyMarket;
  let fxMarket;
  let collateral;
  let loan;
  let orderBook;

  before('deploy OrderBook', async () => {
    let time = await getLatestTimestamp();
    console.log('before    ', toDate(time));

    moneyMarket = await MoneyMarket.new();
    fxMarket = await FXMarket.new();
    collateral = await Collateral.new(moneyMarket.address, fxMarket.address);
    loan = await Loan.new(moneyMarket.address, fxMarket.address, collateral.address);
    await collateral.setLoanAddr(loan.address, {from: owner});
    await moneyMarket.setColAddr(collateral.address, {from: owner});
    
    orderBook = await OrderBook.new(Ccy.FIL, Term._1y);
    await orderBook.setCollateral(collateral.address, {from: owner});
    await collateral.setMarketAddr(moneyMarket.address, orderBook.address, {from: owner});

    console.log();
    console.log('collateral  addr is', collateral.address);
    console.log('order book addr is', orderBook.address);
    console.log();
    console.log('alice       addr is', alice);
    console.log('bob         addr is', bob);
    console.log('carol       addr is', carol);
    console.log();
  });

  describe('Setup Test Data', async () => {
    it('Init Collateral with sample data', async () => {
      sample.Collateral.forEach(async (item, index) => {
        let res = await collateral.setColBook(...val(item), {
          from: users[index],
          // value: 0,
          value: 100000,
        });
        await emitted(res, 'SetColBook');
      });
    });
    it('Init with sample FXMarket', async () => {
      sample.FXMarket.forEach(async (item) => {
        let res = await fxMarket.setFXBook(...val(item), {from: alice});
        await emitted(res, 'SetFXBook');
      });
    });
    it('Create new market order by Alice', async () => {
      let marketOrder = await orderBook.makeOrder(0, 10000, 375, effectiveSec, {from: alice});
      await emitted(marketOrder, 'MakeOrder');
      await printCol(collateral, alice, 'collateral state for alice after making new order');
    });
    it('Take order successfully by Bob and insuficient amount by Carol', async () => {
        let marketOrder = await orderBook.takeOrder(1, 1000, {from: bob});
        await emitted(marketOrder, 'TakeOrder');
        await expectRevert(
            orderBook.takeOrder(1, 9001, {from: carol}),
            "Insuficient amount",
        );    
    });
    it('Cancel created order: revert for Bob and success for Alice', async () => {
        await expectRevert(
            orderBook.cancelOrder(1, {from: bob}),
            "No access to cancel order",
        );
        let marketOrder = await orderBook.cancelOrder(1, {from: alice});
        await emitted(marketOrder, 'CancelOrder');
    });
    it('Create new market order by Bob, and cancel on next day', async () => {
        let marketOrder = await orderBook.makeOrder(1, 1000, 750, effectiveSec, {from: bob});
        await emitted(marketOrder, 'MakeOrder');
        await advanceTimeAndBlock(ONE_DAY);
        let canceledOrder = await orderBook.cancelOrder(2, {from: bob});
        await emitted(canceledOrder, 'CancelOrder');
      });
    it('Create new market order by Bob, wait 15 days and try to take by Alice', async () => {
        let marketOrder = await orderBook.makeOrder(1, 1000, 750, effectiveSec, {from: bob});
        await emitted(marketOrder, 'MakeOrder');
        await advanceTimeAndBlock(NOTICE_GAP + ONE_DAY);
        await expectRevert(
            orderBook.takeOrder(3, 1000, {from: alice}),
            "Order Expired",
        );
      });
  });
});