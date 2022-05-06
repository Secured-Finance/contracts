const PaymentAggregator = artifacts.require('PaymentAggregator');
const PaymentAggregatorCallerMock = artifacts.require(
  'PaymentAggregatorCallerMock',
);
const TimeSlotTest = artifacts.require('TimeSlotTest');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);
const AddressPackingTest = artifacts.require('AddressPackingTest');
const MarkToMarketMock = artifacts.require('MarkToMarketMock');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');
const ERC20Mock = artifacts.require('ERC20Mock');
const WETH9Mock = artifacts.require('WETH9Mock');
const ChainlinkSettlementAdapterMock = artifacts.require(
  'ChainlinkSettlementAdapterMock',
);
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const CurrencyController = artifacts.require('CurrencyController');
const CrosschainAddressResolver = artifacts.require(
  'CrosschainAddressResolver',
);

const { reverted } = require('../test-utils').assert;
const { should } = require('chai');
const { secondTxHash } = require('../test-utils/src/strings');
const {
  toBytes32,
  hexFILString,
  hexETHString,
  hexUSDCString,
  zeroAddress,
  testCcy,
  testJobId,
  testTxHash,
  aliceFILAddress,
  bobFILAddress,
} = require('../test-utils').strings;
const {
  toEther,
  toBN,
  IR_BASE,
  ZERO_BN,
  filToETHRate,
  ethToUSDRate,
  usdcToUSDRate,
  decimalBase,
  oracleRequestFee,
} = require('../test-utils').numbers;
const { getLatestTimestamp, ONE_DAY, advanceTimeAndBlock } =
  require('../test-utils').time;
const { computeNativeSettlementId, computeCrosschainSettlementId } =
  require('../test-utils').settlementId;
should();

const expectRevert = reverted;

contract('PaymentAggregator', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  const firstDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000000';
  const secondDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000001';
  const thirdDealId =
    '0x21aaa47b0000000000000000000000000000000000000000000000000000000f';

  const getTimeSlotIdentifierInYears = async (years) => {
    let slotTime, slotDate;
    let timeSlots = new Array();

    for (i = 0; i < years.length; i++) {
      slotTime = await timeLibrary.addDays(now, years[i] * 365);
      slotDate = await timeLibrary.timestampToDate(slotTime);
      timeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      timeSlots.push(timeSlot);
    }

    return timeSlots;
  };

  const getSlotTimestampsShiftedByYears = async (years) => {
    let slotTime;
    let timestamps = new Array();

    for (i = 0; i < years.length; i++) {
      slotTime = await timeLibrary.addDays(now, years[i] * 365);

      timestamps.push(slotTime);
    }

    return timestamps;
  };

  const getSchedule = async (payNums, coupon, notional) => {
    let payments = new Array();

    for (i = 0; i < payNums; i++) {
      if (i === payNums - 1) {
        payments.push(notional.add(coupon));
      } else {
        payments.push(coupon);
      }
    }

    return payments;
  };

  const checkEmptyTimeSlot = async (timeSlot) => {
    timeSlot[0].toString().should.be.equal('0');
    timeSlot[1].toString().should.be.equal('0');
    timeSlot[2].toString().should.be.equal('0');
    timeSlot[3].toString().should.be.equal('0');
    timeSlot[4].should.be.equal(false);
    timeSlot[5].should.be.equal(false);
  };

  const checkTimeSlot = async (
    timeSlot,
    totalPayment0,
    totalPayment1,
    netPayment,
    paidAmount,
    flipped,
    isSettled,
  ) => {
    timeSlot[0].toString().should.be.equal(totalPayment0.toString());
    timeSlot[1].toString().should.be.equal(totalPayment1.toString());
    timeSlot[2].toString().should.be.equal(netPayment.toString());
    timeSlot[3].toString().should.be.equal(paidAmount.toString());
    timeSlot[4].should.be.equal(flipped);
    timeSlot[5].should.be.equal(isSettled);
  };

  let timeLibrary;
  let paymentAggregator;
  let aggregatorCaller;
  let timeSlotTest;
  let addressPacking;
  let closeOutNetting;

  let totalPayment0 = ZERO_BN;
  let couponPayment0 = ZERO_BN;
  let combinedPayment0 = ZERO_BN;
  let crossPayment0 = ZERO_BN;

  let totalPayment1 = ZERO_BN;
  let couponPayment1 = ZERO_BN;

  let closeOutPayment0 = ZERO_BN;
  let closeOutPayment1 = ZERO_BN;
  let closeOutNetPayment = ZERO_BN;

  let now;
  let _3monthTimeSlot;
  let _1yearTimeSlot;
  let _2yearTimeSlot;
  let _3yearTimeSlot;
  let _4yearTimeSlot;
  let _5yearTimeSlot;

  before('deploy PaymentAggregator and CloseOutNetting contracts', async () => {
    signers = await ethers.getSigners();
    aliceSigner = signers[1];
    bobSigner = signers[2];
    carolSigner = signers[3];

    timeLibrary = await BokkyPooBahsDateTimeContract.new();
    addressPacking = await AddressPackingTest.new();
    timeSlotTest = await TimeSlotTest.new();
    paymentAggregator = await PaymentAggregator.new();
    closeOutNetting = await CloseOutNetting.new(paymentAggregator.address);

    markToMarketMock = await MarkToMarketMock.new();
    aggregatorCaller = await PaymentAggregatorCallerMock.new(
      paymentAggregator.address,
    );
    await paymentAggregator.addPaymentAggregatorUser(aggregatorCaller.address);
    await paymentAggregator.setCloseOutNetting(closeOutNetting.address);
    await paymentAggregator.setMarkToMarket(markToMarketMock.address);

    currencyController = await CurrencyController.new();
    crosschainAddressResolver = await CrosschainAddressResolver.new(
      zeroAddress,
    );

    filToETHPriceFeed = await MockV3Aggregator.new(
      18,
      hexFILString,
      filToETHRate,
    );
    ethToUSDPriceFeed = await MockV3Aggregator.new(
      8,
      hexETHString,
      ethToUSDRate,
    );
    usdcToUSDPriceFeed = await MockV3Aggregator.new(
      8,
      hexUSDCString,
      usdcToUSDRate,
    );

    bobTokenBalance = decimalBase.mul(toBN('100000'));
    usdcToken = await ERC20Mock.new(
      toBytes32('Test USDC'),
      toBytes32('USDC'),
      bob,
      bobTokenBalance,
    );
    wETHToken = await WETH9Mock.new();

    await currencyController.supportCurrency(
      hexETHString,
      'Ethereum',
      60,
      ethToUSDPriceFeed.address,
      7500,
      zeroAddress,
    );

    await currencyController.supportCurrency(
      hexUSDCString,
      'USDC',
      60,
      usdcToUSDPriceFeed.address,
      7500,
      usdcToken.address,
    );

    await currencyController.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    );

    const SettlementEngineFactory = await ethers.getContractFactory(
      'SettlementEngine',
    );
    settlementEngine = await SettlementEngineFactory.deploy(
      paymentAggregator.address,
      currencyController.address,
      crosschainAddressResolver.address,
      wETHToken.address,
    );

    await paymentAggregator.setSettlementEngine(settlementEngine.address);

    linkToken = await LinkToken.new();
    oracleOperator = await Operator.new(linkToken.address, owner);
    settlementAdapter = await ChainlinkSettlementAdapterMock.new(
      oracleOperator.address,
      testJobId,
      oracleRequestFee,
      linkToken.address,
      hexFILString,
      settlementEngine.address,
    );

    await settlementEngine.addExternalAdapter(
      settlementAdapter.address,
      hexFILString,
    );

    await linkToken.transfer(
      settlementAdapter.address,
      toBN('100000000000000000000'),
    );

    await crosschainAddressResolver.methods['updateAddress(uint256,string)'](
      461,
      aliceFILAddress,
      { from: alice },
    );

    await crosschainAddressResolver.methods['updateAddress(uint256,string)'](
      461,
      bobFILAddress,
      { from: bob },
    );
  });

  describe('Prepare time slot identifiers', async () => {
    it('Add Prepare time slot identifiers', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 90);
      let slotDate = await timeLibrary.timestampToDate(slotTime);
      _3monthTimeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      let annualSlots = await getTimeSlotIdentifierInYears([1, 2, 3, 4, 5]);
      _1yearTimeSlot = annualSlots[0];
      _2yearTimeSlot = annualSlots[1];
      _3yearTimeSlot = annualSlots[2];
      _4yearTimeSlot = annualSlots[3];
      _5yearTimeSlot = annualSlots[4];
    });
  });

  describe('Register payments', () => {
    it('Add payments for 1 year loan deal with Alice as a borrower', async () => {
      now = await getLatestTimestamp();
      _1yearDealStart0 = now;
      let slotTime = await timeLibrary.addDays(now, 365);

      let notional = toEther(10000);
      let rate = 700; // 7% interest rate

      couponPayment0 = notional.mul(toBN(rate)).div(IR_BASE);
      totalPayment0 = notional.add(couponPayment0);
      combinedPayment0 = combinedPayment0.add(totalPayment0);
      crossPayment0 = crossPayment0.add(totalPayment0);
      _1yearAlicePayment = totalPayment0;

      closeOutPayment0 = closeOutPayment0.add(totalPayment0);
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      await aggregatorCaller.registerPayments(
        alice,
        bob,
        hexUSDCString,
        firstDealId,
        [slotTime],
        [totalPayment0],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _1yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        totalPayment0,
        '0',
        totalPayment0,
        '0',
        false,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });

    it('Add payments for 5 years loan deal with Alice as a borrower, check all payment time slots', async () => {
      now = await getLatestTimestamp();
      _5yearDealStart0 = now;

      let timestamps = await getSlotTimestampsShiftedByYears([1, 2, 3, 4, 5]);

      let notional = toEther(5000);
      let rate = 1000; // 10% interest rate

      couponPayment0 = notional.mul(toBN(rate)).div(IR_BASE);
      crossPayment0 = crossPayment0.add(couponPayment0);
      totalPayment0 = notional.add(couponPayment0);

      closeOutPayment0 = closeOutPayment0.add(
        notional.add(couponPayment0.mul(toBN('5'))),
      );
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      let payments0 = await getSchedule(5, couponPayment0, notional);
      let payments1 = [0, 0, 0, 0, 0];

      await aggregatorCaller.registerPayments(
        alice,
        bob,
        hexUSDCString,
        secondDealId,
        timestamps,
        payments0,
        payments1,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _1yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        crossPayment0,
        '0',
        crossPayment0,
        '0',
        false,
        false,
      );

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _2yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        couponPayment0,
        '0',
        couponPayment0,
        '0',
        false,
        false,
      );

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _3yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        couponPayment0,
        '0',
        couponPayment0,
        '0',
        false,
        false,
      );

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _4yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        couponPayment0,
        '0',
        couponPayment0,
        '0',
        false,
        false,
      );

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _5yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        totalPayment0,
        '0',
        totalPayment0,
        '0',
        false,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });

    it('Add payments for 3 month deal with Alice as borrower', async () => {
      let slotTime = await timeLibrary.addDays(now, 90);

      let term = 0;
      let notional = toEther(3000);
      let rate = 400; // 4% interest rate
      let actualRate = rate / 4;

      couponPayment0 = notional.mul(toBN(actualRate)).div(IR_BASE);
      totalPayment0 = notional.add(couponPayment0);

      closeOutPayment0 = closeOutPayment0.add(totalPayment0);
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      let dealId =
        '0x21aaa47b00000000000000000000000000000000000000000000000000000012';
      await aggregatorCaller.registerPayments(
        alice,
        bob,
        hexUSDCString,
        dealId,
        [slotTime],
        [totalPayment0],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _3monthTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        totalPayment0,
        '0',
        totalPayment0,
        '0',
        false,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });

    it('Add payments for 3 months deal with Bob as a borrower, expect slot to flip', async () => {
      let slotTime = await timeLibrary.addDays(now, 90);
      let term = 0;
      let notional = toEther(5000);
      let rate = 400; // 4% interest rate
      let actualRate = rate / 4;

      couponPayment1 = notional.mul(toBN(actualRate)).div(IR_BASE);
      totalPayment1 = notional.add(couponPayment1);

      closeOutPayment1 = closeOutPayment1.add(totalPayment1);
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      let dealId =
        '0x21aaa47b00000000000000000000000000000000000000000000000000000032';
      await aggregatorCaller.registerPayments(
        bob,
        alice,
        hexUSDCString,
        dealId,
        [slotTime],
        [totalPayment1],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _3monthTimeSlot,
      );
      let delta;
      if (timeSlot.totalPayment0 > timeSlot.totalPayment1) {
        delta = toBN(timeSlot[0]).sub(toBN(timeSlot[1]));
      } else {
        delta = toBN(timeSlot[1]).sub(toBN(timeSlot[0]));
      }

      checkTimeSlot(
        timeSlot,
        totalPayment0,
        totalPayment1,
        delta,
        '0',
        true,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });

    it('Add payments for 1 year deal with Bob as a borrower, expect slot to flip', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 365);
      _1yearDealStart1 = now;

      let term = 2;
      let notional = toEther(15000);
      let rate = 700; // 7% interest rate

      couponPayment1 = notional.mul(toBN(rate)).div(IR_BASE);
      totalPayment1 = notional.add(couponPayment1);

      closeOutPayment1 = closeOutPayment1.add(totalPayment1);
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      await aggregatorCaller.registerPayments(
        bob,
        alice,
        hexUSDCString,
        thirdDealId,
        [slotTime],
        [totalPayment1],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _1yearTimeSlot,
      );
      let delta = totalPayment1.sub(crossPayment0);

      checkTimeSlot(
        timeSlot,
        crossPayment0,
        totalPayment1,
        delta,
        '0',
        true,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });
  });

  describe('Remove payments', () => {
    it('Remove payments for original 1 year loan deal with Alice as a borrower, expect netPayment to be Bob totalPayment', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 365);

      let notional = toEther(10000);
      let rate = 700; // 7% interest rate

      couponPayment0 = notional.mul(toBN(rate)).div(IR_BASE);
      totalPayment0 = notional.add(couponPayment0);
      combinedPayment0 = combinedPayment0.sub(totalPayment0);
      crossPayment0 = crossPayment0.sub(totalPayment0);
      let delta = totalPayment1.sub(crossPayment0);

      closeOutPayment0 = closeOutPayment0.sub(totalPayment0);
      closeOutNetPayment = closeOutPayment1.sub(closeOutPayment0);

      await aggregatorCaller.removePayments(
        alice,
        bob,
        hexUSDCString,
        firstDealId,
        [slotTime],
        [totalPayment0],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _1yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        crossPayment0,
        totalPayment1,
        delta,
        '0',
        true,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(true);
      closeOut.closed.should.be.equal(false);
    });

    it('Expect revert on removing bigger than registered payments for 1 year timeSlot with Bob as borrower', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 365);
      let notional = toEther(20000);
      let rate = 700; // 7% interest rate
      let coupon = notional.mul(toBN(rate)).div(IR_BASE);
      let total = notional.add(coupon);

      await expectRevert(
        aggregatorCaller.removePayments(
          bob,
          alice,
          hexUSDCString,
          thirdDealId,
          [slotTime],
          [total],
          [0],
        ),
        'SafeMath: subtraction overflow',
      );
    });

    it('Expect revert on removing already removed deal id', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 365);
      let notional = toEther(15000);
      let rate = 700; // 7% interest rate
      let coupon = notional.mul(toBN(rate)).div(IR_BASE);
      let total = notional.add(coupon);

      await expectRevert(
        aggregatorCaller.removePayments(
          bob,
          alice,
          hexUSDCString,
          firstDealId,
          [slotTime],
          [total],
          [0],
        ),
        'NON_REGISTERED_DEAL',
      );
    });

    it('Remove payments for 1 year loan deal with Bob as a borrower, expect netPayment to be 0', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 365);

      let term = 2;
      let notional = toEther(15000);
      let rate = 700;

      let _5yearCouponPayment0 = toEther(5000).mul(toBN(1000)).div(IR_BASE);

      let couponPayment = notional.mul(toBN(rate)).div(IR_BASE);
      let totalPayment = notional.add(couponPayment);

      closeOutPayment1 = closeOutPayment1.sub(totalPayment);
      closeOutNetPayment = closeOutPayment0.sub(closeOutPayment1);

      await aggregatorCaller.removePayments(
        bob,
        alice,
        hexUSDCString,
        thirdDealId,
        [slotTime],
        [totalPayment],
        [0],
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexUSDCString,
        _1yearTimeSlot,
      );
      checkTimeSlot(
        timeSlot,
        '0',
        _5yearCouponPayment0,
        _5yearCouponPayment0,
        '0',
        true,
        false,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(false);
      closeOut.closed.should.be.equal(false);
    });

    it('Remove payments for 5 year loan deal with Alice as a borrower, expect all state being cleared', async () => {
      let term = 5;
      let notional = toEther(5000);
      let rate = 1000; // 10% interest rate

      let timestamps = await getSlotTimestampsShiftedByYears([1, 2, 3, 4, 5]);

      couponPayment = notional.mul(toBN(rate)).div(IR_BASE);
      closeOutPayment0 = closeOutPayment0.sub(
        notional.add(couponPayment.mul(toBN('5'))),
      );
      closeOutNetPayment = closeOutPayment1.sub(closeOutPayment0);

      let payments0 = await getSchedule(5, couponPayment, notional);
      let payments1 = [0, 0, 0, 0, 0];

      await aggregatorCaller.removePayments(
        alice,
        bob,
        hexUSDCString,
        secondDealId,
        timestamps,
        payments0,
        payments1,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _1yearTimeSlot,
      );
      checkEmptyTimeSlot(timeSlot);

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _2yearTimeSlot,
      );
      checkEmptyTimeSlot(timeSlot);

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _3yearTimeSlot,
      );
      checkEmptyTimeSlot(timeSlot);

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _4yearTimeSlot,
      );
      checkEmptyTimeSlot(timeSlot);

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _5yearTimeSlot,
      );
      checkEmptyTimeSlot(timeSlot);

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexUSDCString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutNetPayment.toString());
      closeOut.flipped.should.be.equal(true);
      closeOut.closed.should.be.equal(false);
    });
  });

  describe('Verify payment and settle payment', () => {
    let slotTime;
    let notional0 = toEther(3000);
    let notional1 = toEther(5000);
    let rate = 400; // 4% interest rate
    let actualRate = rate / 4;

    let couponPayment0 = notional0.mul(toBN(actualRate)).div(IR_BASE);
    let totalPayment0 = notional0.add(couponPayment0);

    let couponPayment1 = notional1.mul(toBN(actualRate)).div(IR_BASE);
    let totalPayment1 = notional1.add(couponPayment1);

    let netPayment = totalPayment1.sub(totalPayment0);

    it('Expect revert on validating USDC token payment by Bob, as token transfer is not approved', async () => {
      slotTime = await timeLibrary.addDays(now, 90);

      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexUSDCString,
            netPayment.toString(),
            slotTime.toString(),
            '',
          ),
        'TransferHelper: TRANSFER_FROM_FAILED',
      );
    });

    it('Shift time for 89 days and approve token payment, successfully verify payment', async () => {
      await advanceTimeAndBlock(89 * ONE_DAY);
      await usdcToken.approveInternal(
        bob,
        settlementEngine.address,
        netPayment.toString(),
      );

      await settlementEngine
        .connect(bobSigner)
        .verifyPayment(
          alice,
          hexUSDCString,
          netPayment.toString(),
          slotTime.toString(),
          '',
        );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexUSDCString,
        _3monthTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(netPayment.toString());
      timeSlot[3].toString().should.be.equal(netPayment.toString());
      timeSlot[4].should.be.equal(true);
      timeSlot[5].should.be.equal(true);

      const settlementId = computeNativeSettlementId(
        bob,
        alice,
        hexUSDCString,
        netPayment,
        slotTime,
      );

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexUSDCString,
          _3monthTimeSlot,
          settlementId,
        );
      confirmation[0].should.be.equal(bob);
      confirmation[1].toString().should.be.equal(netPayment.toString());
    });

    it('Add new 3 month FIL deal for Alice, try to verify payment too early', async () => {
      now = await getLatestTimestamp();
      slotTime = await timeLibrary.addDays(now, 90);

      await aggregatorCaller.registerPayments(
        alice,
        bob,
        hexFILString,
        firstDealId,
        [slotTime],
        [totalPayment0],
        [0],
      );

      await expectRevert(
        settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            couponPayment0.toString(),
            slotTime.toString(),
            testTxHash,
          ),
        'OUT_OF_SETTLEMENT_WINDOW',
      );
    });

    it('Verify payment after 89 days, and settle the payment by external adapter', async () => {
      now = await getLatestTimestamp();
      slotTime = await timeLibrary.addDays(now, 90);
      let slotDate = await timeLibrary.timestampToDate(slotTime);
      _3monthTimeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      await advanceTimeAndBlock(89 * ONE_DAY);

      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            couponPayment0.toString(),
            slotTime.toString(),
            testTxHash,
          )
      ).wait();

      settlementRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      await settlementAdapter.fulfill(
        settlementRequestId,
        aliceFILAddress,
        bobFILAddress,
        couponPayment0.toString(),
        slotTime.toString(),
        testTxHash,
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(totalPayment0.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(totalPayment0.toString());
      timeSlot[3].toString().should.be.equal(couponPayment0.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);

      const settlementId = computeCrosschainSettlementId(testTxHash);

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexFILString,
          _3monthTimeSlot,
          settlementId,
        );
      confirmation[0].should.be.equal(alice);
      confirmation[1].toString().should.be.equal(couponPayment0.toString());
    });

    it('Verify and settle the remaining payment, validate that timeSlot is settled', async () => {
      const paymentAmount = totalPayment0.sub(couponPayment0);
      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            paymentAmount.toString(),
            slotTime.toString(),
            secondTxHash,
          )
      ).wait();

      settlementRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      await settlementAdapter.fulfill(
        settlementRequestId,
        aliceFILAddress,
        bobFILAddress,
        paymentAmount.toString(),
        slotTime.toString(),
        secondTxHash,
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(totalPayment0.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(totalPayment0.toString());
      timeSlot[3].toString().should.be.equal(totalPayment0.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);

      const settlementId = computeCrosschainSettlementId(secondTxHash);

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexFILString,
          _3monthTimeSlot,
          settlementId,
        );
      confirmation[0].should.be.equal(alice);
      confirmation[1].toString().should.be.equal(paymentAmount.toString());
    });
  });

  describe('Calculate gas costs', () => {
    it('Gas costs for time shift', async () => {
      now = await getLatestTimestamp();

      let gasCost = await timeLibrary.getGasCostofAddYears(now, 1);
      console.log(
        'Gas cost for adding 1 year is ' + gasCost.toString() + ' gas',
      );

      gasCost = await timeLibrary.getGasCostofAddYears(now, 5);
      console.log(
        'Gas cost for adding 5 years is ' + gasCost.toString() + ' gas',
      );

      gasCost = await timeLibrary.getGasCostofAddMonths(now, 3);
      console.log(
        'Gas cost for adding 3 months is ' + gasCost.toString() + ' gas',
      );

      gasCost = await timeLibrary.getGasCostofAddMonths(now, 60);
      console.log(
        'Gas cost for adding 5 years in months is ' +
          gasCost.toString() +
          ' gas',
      );

      gasCost = await timeLibrary.getGasCostofAddDays(now, 91);
      console.log('Gas cost for adding days is ' + gasCost.toString() + ' gas');
    });
  });
});
