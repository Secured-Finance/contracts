const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');
const ERC20Mock = artifacts.require('ERC20Mock');
const ChainlinkSettlementAdapterMock = artifacts.require(
  'ChainlinkSettlementAdapterMock',
);
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const PaymentAggregatorCallerMock = artifacts.require(
  'PaymentAggregatorCallerMock',
);
const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);
const TimeSlotTest = artifacts.require('TimeSlotTest');
const MarkToMarketMock = artifacts.require('MarkToMarketMock');

const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { zeroAddress } = require('ethereumjs-util');
const {
  hexFILString,
  hexETHString,
  hexUSDCString,
  toBytes32,
  testCcy,
  testJobId,
  testTxHash,
  aliceFILAddress,
  bobFILAddress,
  secondTxHash,
  thirdTxHash,
  loanPrefix,
} = require('../test-utils').strings;
const {
  toEther,
  toBN,
  IR_BASE,
  ZERO_BN,
  usdcToUSDRate,
  decimalBase,
  oracleRequestFee,
} = require('../test-utils').numbers;
const { getLatestTimestamp, ONE_DAY, advanceTimeAndBlock } =
  require('../test-utils').time;
const { Deployment } = require('../test-utils').deployment;

should();

contract('SettlementEngine', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  const firstDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000001';
  const secondDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000002';
  const thirdDealId =
    '0x21aaa47b00000000000000000000000000000000000000000000000000000003';

  let settlementEngine;
  let settlementAdapter;
  let linkToken;
  let oracleOperator;
  let timeLibrary;
  let paymentAggregator;
  let paymentAggregatorMock;
  let timeSlotTest;
  let crosschainAddressResolver;

  let now;
  let _3monthTimeSlot;
  let _3monthTime;
  let _6monthTimeSlot;

  let _3monthCoupon0 = ZERO_BN;
  let _3monthCoupon1 = ZERO_BN;
  let _3monthTotal0 = ZERO_BN;
  let _3monthTotal1 = ZERO_BN;

  let aliceRequestId;
  let bobRequestId;

  const checkETHBalance = async (provider, address) => {
    return provider.getBalance(address);
  };

  before('deploy SettlementEngine and all required contracts', async () => {
    signers = await ethers.getSigners();
    aliceSigner = signers[1];
    bobSigner = signers[2];
    carolSigner = signers[3];

    const markToMarketMock = await MarkToMarketMock.new();

    const deployment = new Deployment();
    deployment.mock('MarkToMarket').useValue(markToMarketMock);
    ({
      currencyController,
      settlementEngine,
      crosschainAddressResolver,
      paymentAggregator,
      productAddressResolver,
      lendingMarketController,
    } = await deployment.execute());

    paymentAggregatorMock = await PaymentAggregatorCallerMock.new(
      paymentAggregator.address,
    );

    await productAddressResolver.registerProduct(
      loanPrefix,
      paymentAggregatorMock.address,
      lendingMarketController.address,
    );

    timeLibrary = await BokkyPooBahsDateTimeContract.new();
    timeSlotTest = await TimeSlotTest.new();

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

    await currencyController.supportCurrency(
      hexUSDCString,
      'USDC',
      60,
      usdcToUSDPriceFeed.address,
      7500,
      usdcToken.address,
    );

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

  describe('Test linking settlement engine with external adapters', async () => {
    it('Should revert on adding a new external adapter for non-supported currency', async () => {
      await expectRevert(
        settlementEngine.addExternalAdapter(settlementAdapter.address, testCcy),
        'NON_SUPPORTED_CCY',
      );
    });

    it('Should revert on adding a new external adapter with non-contract address', async () => {
      await expectRevert(
        settlementEngine.addExternalAdapter(zeroAddress(), hexFILString),
        'NOT_CONTRACT',
      );
    });

    it('Should successfully add new external adapter for FIL', async () => {
      await settlementEngine.addExternalAdapter(
        settlementAdapter.address,
        hexFILString,
      );
    });
  });

  describe('Test payment verification by chainlink external adapter', async () => {
    it('Add payments for 90 days deal, check timeslot state', async () => {
      now = await getLatestTimestamp();
      _3monthPaymentStart = now;
      const slotTime = await timeLibrary.addDays(now, 90);
      _3monthTime = slotTime;
      const slotDate = await timeLibrary.timestampToDate(slotTime);
      _3monthTimeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      const notional = toEther(10000);
      const rate = 1200; // 12% interest rate
      const actualRate = rate / 4;

      _3monthCoupon0 = notional.mul(toBN(actualRate)).div(IR_BASE);
      _3monthTotal0 = notional.add(_3monthCoupon0);

      await paymentAggregatorMock.registerPayments(
        alice,
        bob,
        hexFILString,
        firstDealId,
        [slotTime],
        [_3monthTotal0],
        [0],
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);
    });

    it('Should revert on trying to verify payment too early', async () => {
      await expectRevert(
        settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            _3monthCoupon0.toString(),
            _3monthTime.toString(),
            testTxHash,
          ),
        'OUT_OF_SETTLEMENT_WINDOW',
      );
    });

    it('Should revert on transfer verification with no LINK tokens on ChainlinkSettlementAdapter', async () => {
      await advanceTimeAndBlock(89 * ONE_DAY);
      await expectRevert.unspecified(
        settlementEngine.verifyPayment(
          bob,
          hexFILString,
          _3monthCoupon0.toString(),
          _3monthTime.toString(),
          testTxHash,
        ),
      );
    });

    it('Should try to verify p2p transfer in FIL chain, validate state changes', async () => {
      await linkToken.transfer(
        settlementAdapter.address,
        toBN('100000000000000000000'),
      );

      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            _3monthCoupon0.toString(),
            _3monthTime.toString(),
            testTxHash,
          )
      ).wait();

      aliceRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;
    });

    it('Should revert on Alice trying to fulfill oracle request', async () => {
      const oracleResponse = {
        from: aliceFILAddress,
        to: bobFILAddress,
        value: _3monthCoupon0.toString(),
        timestamp: _3monthTime.toString(),
        txHash: testTxHash,
      };

      await expectRevert(
        settlementEngine.fulfillSettlementRequest(
          aliceRequestId,
          oracleResponse,
          hexFILString,
        ),
        'NOT_EXTERNAL_ADAPTER',
      );
    });

    it('Should revert on validating oracle request with incorrect addresses', async () => {
      await expectRevert(
        settlementAdapter.fulfill(
          aliceRequestId,
          '0xjbfsjabfjaa',
          bobFILAddress,
          _3monthCoupon0.toString(),
          _3monthTime.toString(),
          testTxHash,
        ),
        'INCORRECT_ADDRESS_FROM',
      );
    });

    it('Should revert on validating oracle request with incorrect tx hash', async () => {
      await expectRevert(
        settlementAdapter.fulfill(
          aliceRequestId,
          aliceFILAddress,
          bobFILAddress,
          _3monthCoupon0.toString(),
          _3monthTime.toString(),
          toBytes32('0xIncorrectTxHash'),
        ),
        'INCORRECT_TX_HASH',
      );
    });

    it('Should revert on validating oracle request with too much funds', async () => {
      const paymentAmount = _3monthTotal0.add(_3monthCoupon0);

      await expectRevert(
        settlementAdapter.fulfill(
          aliceRequestId,
          aliceFILAddress,
          bobFILAddress,
          paymentAmount.toString(),
          _3monthTime.toString(),
          testTxHash,
        ),
        'Payment overflow',
      );
    });

    it('Should successfully validate oracle request after time shift, check state', async () => {
      await settlementAdapter.fulfill(
        aliceRequestId,
        aliceFILAddress,
        bobFILAddress,
        _3monthCoupon0.toString(),
        _3monthTime.toString(),
        testTxHash,
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[3].toString().should.be.equal(_3monthCoupon0.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);
    });

    it('Try to verify second payment by Bob, expect revert on external adapter verification due to incorrect sender', async () => {
      const paymentAmount = _3monthTotal0.sub(_3monthCoupon0);

      const requestId = await (
        await settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexFILString,
            paymentAmount.toString(),
            _3monthTime.toString(),
            secondTxHash,
          )
      ).wait();

      bobRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      await expectRevert(
        settlementAdapter.fulfill(
          bobRequestId,
          bobFILAddress,
          aliceFILAddress,
          paymentAmount.toString(),
          _3monthTime.toString(),
          secondTxHash,
          { from: bob },
        ),
        'Incorrect verification party',
      );
    });

    it('Expect revert on chainlink external adapter validating incorrect settlement request', async () => {
      const paymentAmount = _3monthTotal0.sub(_3monthCoupon0);

      await expectRevert(
        settlementAdapter.fulfill(
          bobRequestId,
          aliceFILAddress,
          bobFILAddress,
          paymentAmount.toString(),
          _3monthTime.toString(),
          secondTxHash,
        ),
        'INCORRECT_ADDRESS_FROM',
      );
    });

    it('Successfully validate Alice second payment for remaining amount, expect timeslot to be settled', async () => {
      const paymentAmount = _3monthTotal0.sub(_3monthCoupon0);

      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            paymentAmount.toString(),
            _3monthTime.toString(),
            secondTxHash,
          )
      ).wait();

      aliceRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      await settlementAdapter.fulfill(
        aliceRequestId,
        aliceFILAddress,
        bobFILAddress,
        paymentAmount.toString(),
        _3monthTime.toString(),
        secondTxHash,
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[3].toString().should.be.equal(_3monthTotal0.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);
    });

    it('Expect revert on third validation as timeslot is settled already', async () => {
      const paymentAmount = toEther('1');

      await expectRevert(
        settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            paymentAmount.toString(),
            _3monthTime.toString(),
            thirdTxHash,
          ),
        'TIMESLOT_SETTLED_ALREADY',
      );
    });
  });

  describe('Test payment verification for ERC20 token settlement', async () => {
    it('Add payments for 180 days deal, check timeslot state', async () => {
      now = await getLatestTimestamp();
      _6monthPaymentStart = now;
      const slotTime = await timeLibrary.addDays(now, 180);
      _6monthTime = slotTime;
      const slotDate = await timeLibrary.timestampToDate(slotTime);
      _6monthTimeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      const notional = toEther(5000);
      const rate = 2000; // 20% interest rate
      const actualRate = rate / 2;

      _6monthCoupon1 = notional.mul(toBN(actualRate)).div(IR_BASE);
      _6monthTotal1 = notional.add(_6monthCoupon1);

      await paymentAggregatorMock.registerPayments(
        bob,
        alice,
        hexUSDCString,
        secondDealId,
        [slotTime],
        [_6monthTotal1],
        [0],
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexUSDCString,
        _6monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);
    });

    it('Expect revert on validating USDC token payment by Bob, as token transfer is not approved', async () => {
      await advanceTimeAndBlock(179 * ONE_DAY);
      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexUSDCString,
            _6monthCoupon1.toString(),
            _6monthTime.toString(),
            '',
          ),
        'TransferHelper: TRANSFER_FROM_FAILED',
      );
    });

    it('Approve transfer and successfully validate coupon payment by Bob, check state and balances', async () => {
      const bobUSDCBalanceBefore = await usdcToken.balanceOf(bob);
      const aliceUSDCBalanceBefore = await usdcToken.balanceOf(alice);

      await usdcToken.approveInternal(
        bob,
        settlementEngine.address,
        _6monthTotal1.mul(toBN('2')), // approving double the required payment
      );

      await settlementEngine
        .connect(bobSigner)
        .verifyPayment(
          alice,
          hexUSDCString,
          _6monthCoupon1.toString(),
          _6monthTime.toString(),
          '',
        );

      const bobBalanceAfter = await usdcToken.balanceOf(bob);
      bobBalanceAfter
        .add(_6monthCoupon1)
        .toString()
        .should.be.equal(bobUSDCBalanceBefore.toString());

      const aliceBalanceAfter = await usdcToken.balanceOf(alice);
      aliceUSDCBalanceBefore
        .add(_6monthCoupon1)
        .toString()
        .should.be.equal(aliceBalanceAfter.toString());

      (await usdcToken.balanceOf(settlementEngine.address))
        .toString()
        .should.be.equal('0');

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexUSDCString,
        _6monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[3].toString().should.be.equal(_6monthCoupon1.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);
    });

    it('Expect revert on validating overflowing USDC token payment', async () => {
      await expectRevert(
        settlementEngine.connect(bobSigner).verifyPayment(
          alice,
          hexUSDCString,
          _6monthTotal1.toString(), // coupon already paid here
          _6monthTime.toString(),
          '',
        ),
        'Payment overflow',
      );
    });

    it('Successfully pay the remaining amount of coupon and validate that timeslot is finally settled', async () => {
      const bobUSDCBalanceBefore = await usdcToken.balanceOf(bob);
      const aliceUSDCBalanceBefore = await usdcToken.balanceOf(alice);
      const paymentAmount = _6monthTotal1.sub(_6monthCoupon1);

      await settlementEngine
        .connect(bobSigner)
        .verifyPayment(
          alice,
          hexUSDCString,
          paymentAmount.toString(),
          _6monthTime.toString(),
          '',
        );

      const bobBalanceAfter = await usdcToken.balanceOf(bob);
      bobBalanceAfter
        .add(paymentAmount)
        .toString()
        .should.be.equal(bobUSDCBalanceBefore.toString());

      const aliceBalanceAfter = await usdcToken.balanceOf(alice);
      aliceUSDCBalanceBefore
        .add(paymentAmount)
        .toString()
        .should.be.equal(aliceBalanceAfter.toString());

      (await usdcToken.balanceOf(settlementEngine.address))
        .toString()
        .should.be.equal('0');

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexUSDCString,
        _6monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[3].toString().should.be.equal(_6monthTotal1.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);
    });

    it('Expect revert on non-existing currency settlement payment', async () => {
      const paymentAmount = _3monthTotal1.mul(toBN('2')).toString();
      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            toBytes32('DummyToken'),
            paymentAmount.toString(),
            _6monthTime.toString(),
            '',
          ),
        "ADAPTER_DOESN'T_EXIST",
      );
    });
  });

  describe('Test payment verification for native ETH settlement', async () => {
    it('Add payments for 90 days deal, check timeslot state', async () => {
      now = await getLatestTimestamp();
      _3monthPaymentStart = now;
      const slotTime = await timeLibrary.addDays(now, 90);
      _3monthTime = slotTime;
      const slotDate = await timeLibrary.timestampToDate(slotTime);
      _3monthTimeSlot = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      const notional = toEther(100);
      const rate = 2000; // 20% interest rate
      const actualRate = rate / 4;

      _3monthCoupon1 = notional.mul(toBN(actualRate)).div(IR_BASE);
      _3monthTotal1 = notional.add(_3monthCoupon1);

      await paymentAggregatorMock.registerPayments(
        bob,
        alice,
        hexETHString,
        thirdDealId,
        [slotTime],
        [_3monthTotal1],
        [0],
      );

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexETHString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_3monthTotal1.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_3monthTotal1.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(false);

      await advanceTimeAndBlock(89 * ONE_DAY);
    });

    it('Expect revert on validating ETH payment by Bob, as msg.value is 0', async () => {
      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexETHString,
            _3monthCoupon1.toString(),
            _3monthTime.toString(),
            '',
          ),
        'INCORRECT_ETH_VALUE',
      );
    });

    it('Expect revert while msg.value and payment amounts are different', async () => {
      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexETHString,
            _3monthTotal1.toString(),
            _3monthTime.toString(),
            '',
            { value: _3monthTotal1.mul(toBN('2')).toString() },
          ),
        'INCORRECT_ETH_VALUE',
      );
    });

    it('Expect revert on overflowing ETH payment by Bob', async () => {
      const paymentAmount = _3monthTotal1.mul(toBN('2')).toString();
      await expectRevert(
        settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexETHString,
            paymentAmount,
            _3monthTime.toString(),
            '',
            { value: paymentAmount },
          ),
        'Payment overflow',
      );
    });

    it('Successfully verify ETH payment by Bob, validate balances and timeslot settlement status', async () => {
      const provider = bobSigner.provider;
      const paymentAmount = _3monthTotal1;

      await (
        await settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexETHString,
            paymentAmount.toString(),
            _3monthTime.toString(),
            '',
            { value: paymentAmount.toString() },
          )
      ).wait();

      const engineBalance = await checkETHBalance(
        provider,
        settlementEngine.address,
      );
      engineBalance.toString().should.be.equal('0');

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexETHString,
        _3monthTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(_3monthTotal1.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(_3monthTotal1.toString());
      timeSlot[3].toString().should.be.equal(_3monthTotal1.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);
    });
  });
});
