const Collateral = artifacts.require('Collateral');
const OrderBook = artifacts.require('LendingMarket');
const Loan = artifacts.require('Loan');
const FXRatesAggregator = artifacts.require('FXRatesAggregator');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

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
const { orders } = require("./orders");
const { should } = require('chai');
should();

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
  const filRate = web3.utils.toBN("67175250000000000");

  let snapshotId;
  let fxMarket;
  let collateral;
  let loan;
  let orderBook;
  let orderList;

  before('deploy OrderBook', async () => {
    let time = await getLatestTimestamp();
    console.log('before    ', toDate(time));
    orderList = orders;

    loan = await Loan.new();
    collateral = await Collateral.new(loan.address);
    await loan.setCollateralAddr(collateral.address, {from: owner});
    ratesAggregator = await FXRatesAggregator.new();
    filToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.FIL, filRate);
    setPriceFeedTx = await ratesAggregator.linkPriceFeed(Ccy.FIL, filToETHPriceFeed.address, true);
    await emitted(setPriceFeedTx, 'PriceFeedAdded');

    await collateral.setRatesAggregatorAddr(ratesAggregator.address, {from: owner});
    
    orderBook = await OrderBook.new(Ccy.FIL, Term._1y, owner);
    await orderBook.setCollateral(collateral.address, {from: owner});
    await orderBook.setLoan(loan.address, {from: owner});
    await collateral.addLendingMarket(Ccy.FIL, Term._1y, orderBook.address, {from: owner});
    await loan.addLendingMarket(Ccy.FIL, Term._1y, orderBook.address, {from: owner});
  });

  describe('Init Collateral with 100,000 Wei for Alice, Bob and Carol', async () => {
    it('Register collateral book with 100,000 Wei payment by Alice', async () => {
        let result = await collateral.register("Alice", "f0152351", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4", {from: alice, value: 100000});
        await emitted(result, 'Register');
    });

    it('Get Bob collateral book and check values', async () => {
        const book = await collateral.getOneBook(alice);
        
        book[0].should.be.equal('Alice');
        book[1].should.be.equal(web3.utils.utf8ToHex("f0152351"));
        book[2].should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4"));
        book[3].should.be.equal('100000');
        book[4].should.be.equal('0');
        book[5].should.be.equal('0');
        book[6].should.be.equal('0');
        book[7].should.be.equal('0');
        book[8].should.be.equal(true);
        book[9].should.be.equal('1');
    });

    it('Register collateral book with 100,000 Wei payment by Bob', async () => {
      let result = await collateral.register("Bob", "f01523555", "3LvFB9E2rqjnvHmjUbQqpcc4gingrN45Y4", {from: bob, value: 100000});
      await emitted(result, 'Register');
    });

    it('Get Bob collateral book and check values', async () => {
        const book = await collateral.getOneBook(bob);
        
        book[0].should.be.equal('Bob');
        book[1].should.be.equal(web3.utils.utf8ToHex("f01523555"));
        book[2].should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4gingrN45Y4"));
        book[3].should.be.equal('100000');
        book[4].should.be.equal('0');
        book[5].should.be.equal('0');
        book[6].should.be.equal('0');
        book[7].should.be.equal('0');
        book[8].should.be.equal(true);
        book[9].should.be.equal('1');
    });

    it('Register collateral book with 100,000 Wei payment by Carol', async () => {
      let result = await collateral.register("Carol", "f01524214", "3LvIj382rqjnvHmjUbQqpcc4gingrN45Y4", {from: carol, value: 100000});
      await emitted(result, 'Register');
    });

    it('Get Bob collateral book and check values', async () => {
        const book = await collateral.getOneBook(carol);
        
        book[0].should.be.equal('Carol');
        book[1].should.be.equal(web3.utils.utf8ToHex("f01524214"));
        book[2].should.be.equal(web3.utils.utf8ToHex("3LvIj382rqjnvHmjUbQqpcc4gingrN45Y4"));
        book[3].should.be.equal('100000');
        book[4].should.be.equal('0');
        book[5].should.be.equal('0');
        book[6].should.be.equal('0');
        book[7].should.be.equal('0');
        book[8].should.be.equal(true);
        book[9].should.be.equal('1');
    });
  });

  describe('Setup Test Data', async () => {
    it('Create new market order by Alice', async () => {
      let marketOrder = await orderBook.order(0, 10000, 375, effectiveSec, {from: alice});
      await emitted(marketOrder, 'MakeOrder');
    });
    it('Take order successfully by Bob and insuficient amount by Carol', async () => {
        let marketOrder = await orderBook.order(1, 1000, 375, effectiveSec, {from: bob});
        await emitted(marketOrder, 'TakeOrder');

        let marketOrder2 = await orderBook.order(1, 15000, 375, effectiveSec, {from: carol});
        await emitted(marketOrder2, 'MakeOrder');
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
        let marketOrder = await orderBook.order(1, 1000, 750, effectiveSec, {from: bob});
        await emitted(marketOrder, 'MakeOrder');
        await advanceTimeAndBlock(ONE_DAY);
        let canceledOrder = await orderBook.cancelOrder(3, {from: bob});
        await emitted(canceledOrder, 'CancelOrder');
      });
    it('Create new market order by Bob, wait 15 days and try to take by Alice but cancel instead', async () => {
        let marketOrder = await orderBook.order(1, 1000, 750, effectiveSec, {from: bob});
        await emitted(marketOrder, 'MakeOrder');
        await advanceTimeAndBlock(NOTICE_GAP + ONE_DAY);

        let canceledOrder = await orderBook.order(0, 1000, 750, effectiveSec, {from: alice});
        await emitted(canceledOrder, 'CancelOrder');
      });

      it('Create 10 new market orders with the same interest rate', async () => {
        for(i=0; i < orderList.length; i++) {
          amount = orderList[i]["amount"];
          orderId = orderList[i]["orderId"];
          rate = orderList[i]["rate"];

          let marketOrder = await orderBook.order(0, amount, rate, effectiveSec, {from: bob});
          await emitted(marketOrder, 'MakeOrder');
        }
      });

      it('check market orders from linked list', async () => {
        for(i=0; i < orderList.length; i++) {
          amount = orderList[i]["amount"];
          orderId = orderList[i]["orderId"];
          rate = orderList[i]["rate"];

          const marketOrder = await orderBook.getOrderFromTree(0, rate, orderId);
          console.log("Order ID: " + marketOrder[0].toNumber());
          console.log("Next: " + marketOrder[1].toNumber());
          console.log("Prev: " + marketOrder[2].toNumber());
          console.log("Timestamp: " + marketOrder[3].toNumber());
          console.log("Amount: " + marketOrder[4].toNumber());

          console.log();
          }
      })

      it('Try to take 10 market orders with the same interest rate', async () => {
        for(i=0; i < orderList.length; i++) {
          amount = orderList[i]["amount"];
          orderId = orderList[i]["orderId"];
          rate = orderList[i]["rate"];

          let marketOrder = await orderBook.order(1, amount, rate, effectiveSec, {from: alice});
          await emitted(marketOrder, 'TakeOrder');
        }
      });

  });
});