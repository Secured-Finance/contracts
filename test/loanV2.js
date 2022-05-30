const LoanCallerMock = artifacts.require('LoanCallerMock');
const CollateralAggregatorCallerMock = artifacts.require(
  'CollateralAggregatorCallerMock',
);
const AddressPackingTest = artifacts.require('AddressPackingTest');
const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);
const TimeSlotTest = artifacts.require('TimeSlotTest');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');
const ChainlinkSettlementAdapterMock = artifacts.require(
  'ChainlinkSettlementAdapterMock',
);

const { should } = require('chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const utils = require('web3-utils');

const {
  toBytes32,
  loanPrefix,
  hexFILString,
  hexBTCString,
  hexETHString,
  testJobId,
  testTxHash,
  secondTxHash,
  aliceFILAddress,
  bobFILAddress,
} = require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;
const { toBN, IR_BASE, oracleRequestFee } = require('../test-utils').numbers;
const { getLatestTimestamp, ONE_DAY, advanceTime } =
  require('../test-utils').time;
const { computeCrosschainSettlementId } = require('../test-utils').settlementId;
const { hashPosition } = require('../test-utils').timeSlot;
const { Deployment } = require('../test-utils').deployment;

should();

contract('LoanV2', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let signers;

  let _1yearTimeSlot;
  let _2yearTimeSlot;
  let _3yearTimeSlot;
  let _4yearTimeSlot;
  let _5yearTimeSlot;

  let aliceRequestId;

  let addressResolver;
  let closeOutNetting;
  let collateralAggregator;
  let crosschainAddressResolver;
  let currencyController;
  let lendingMarketController;
  let loan;
  let paymentAggregator;
  let settlementEngine;
  let termStructure;

  const generateId = (value, prefix) => {
    let right = utils.toBN(utils.rightPad(prefix, 64));
    let left = utils.toBN(utils.leftPad(value, 64));

    let id = utils.numberToHex(right.or(left));

    return id;
  };

  const getTimeSlotIdentifierInYears = async (now, years) => {
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

  before('deploy smart contracts for testing LoanV2', async () => {
    signers = await ethers.getSigners();
    aliceSigner = signers[1];
    bobSigner = signers[2];

    const deployment = new Deployment();
    deployment
      .mock('LendingMarketController')
      .useFactory('LendingMarketControllerMock', (instances) => ({
        DiscountFactor: instances.discountFactorLibrary.address,
      }))
      .deploy();

    ({
      addressResolver,
      paymentAggregator,
      closeOutNetting,
      collateralAggregator,
      currencyController,
      crosschainAddressResolver,
      termStructure,
      loan,
      settlementEngine,
      wETHToken,
      lendingMarketController,
    } = await deployment.execute());

    loanCaller = await LoanCallerMock.new(loan.address);

    collateralCaller = await CollateralAggregatorCallerMock.new(
      collateralAggregator.address,
    );

    await loan.addLendingMarket(hexFILString, '1825', loanCaller.address);
    await loan.addLendingMarket(hexFILString, '90', loanCaller.address);

    ethVault = await ethers
      .getContractFactory('CollateralVault')
      .then((factory) =>
        factory.deploy(
          addressResolver.address,
          hexETHString,
          wETHToken.address,
          wETHToken.address,
        ),
      );

    await collateralAggregator.linkLendingMarket(collateralCaller.address);
    await collateralAggregator.linkCollateralVault(ethVault.address);

    for (i = 0; i < sortedTermDays.length; i++) {
      await termStructure.supportTerm(
        sortedTermDays[i],
        [loanPrefix],
        [hexBTCString, hexFILString, hexETHString],
      );
    }

    await lendingMarketController.setSupportedTerms(
      hexETHString,
      sortedTermDays,
    );
    await lendingMarketController.setSupportedTerms(
      hexFILString,
      sortedTermDays,
    );
    await lendingMarketController.setSupportedTerms(
      hexBTCString,
      sortedTermDays,
    );

    addressPacking = await AddressPackingTest.new();

    timeLibrary = await BokkyPooBahsDateTimeContract.new();
    timeSlotTest = await TimeSlotTest.new();

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

  describe('Test the execution of loan deal between Alice and Bob', async () => {
    let filAmount = utils.toBN('30000000000000000000');
    let filUsed = filAmount.mul(utils.toBN(2000)).div(utils.toBN(10000));
    let aliceFIlUsed = filUsed.mul(utils.toBN(15000)).div(utils.toBN(10000));
    let bobFILUsed = filAmount.mul(utils.toBN(15000)).div(utils.toBN(10000));

    const dealId = generateId(1, loanPrefix);
    const rate = '1450';

    const coupon = filAmount.mul(toBN(rate)).div(IR_BASE);
    const repayment = filAmount.add(coupon);
    const closeOutPayment = filAmount.add(coupon.mul(toBN('5'))).sub(filAmount);

    let start;
    let maturity;

    it('Prepare the yield curve', async () => {
      const lendRates = [920, 1020, 1120, 1220, 1320, 1520];
      const borrowRates = [780, 880, 980, 1080, 1180, 1380];
      const midRates = [850, 950, 1050, 1150, 1250, 1450];

      let tx = await lendingMarketController.setBorrowRatesForCcy(
        hexFILString,
        borrowRates,
      );
      tx = await lendingMarketController.setLendRatesForCcy(
        hexFILString,
        lendRates,
      );

      let rates = await lendingMarketController.getMidRatesForCcy(hexFILString);
      rates.map((rate, i) => {
        rate.toNumber().should.be.equal(midRates[i]);
      });
    });

    it('Register collateral books for Bob and Alice', async () => {
      const [, aliceSigner, bobSigner] = await ethers.getSigners();
      const aliceDepositAmt = toBN('1000000000000000000');
      const bobDepositAmt = toBN('10000000000000000000');

      let result = await collateralAggregator.register({ from: alice });
      expectEvent(result, 'Register');

      await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](aliceDepositAmt.toString(), {
            value: aliceDepositAmt.toString(),
          })
      ).wait();

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceDepositAmt.toString());

      result = await collateralAggregator.register({ from: bob });
      expectEvent(result, 'Register');

      await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](bobDepositAmt.toString(), {
            value: bobDepositAmt.toString(),
          })
      ).wait();

      independentCollateral = await ethVault.getIndependentCollateral(bob);
      independentCollateral
        .toString()
        .should.be.equal(bobDepositAmt.toString());
    });

    it('Register new loan deal between Alice and Bob', async () => {
      // Alice is lender, trying to lend 30 FIL for 5 years

      await collateralCaller.useUnsettledCollateral(
        alice,
        hexFILString,
        filUsed,
      );

      await loanCaller.register(
        alice,
        bob,
        0,
        hexFILString,
        '1825',
        filAmount,
        rate,
      );
      start = await timeLibrary._now();
      maturity = await timeLibrary.addDays(start, 1825);

      let annualSlots = await getTimeSlotIdentifierInYears(
        start,
        [1, 2, 3, 4, 5],
      );
      _1yearTimeSlot = annualSlots[0];
      _2yearTimeSlot = annualSlots[1];
      _3yearTimeSlot = annualSlots[2];
      _4yearTimeSlot = annualSlots[3];
      _5yearTimeSlot = annualSlots[4];

      let deal = await loan.getLoanDeal(dealId);
      deal.lender.should.be.equal(alice);
      deal.borrower.should.be.equal(bob);
      deal.ccy.should.be.equal(hexFILString);
      deal.term.toString().should.be.equal('1825');
      deal.notional.toString().should.be.equal(filAmount.toString());
      deal.rate.toString().should.be.equal(rate);
      deal.start.toString().should.be.equal(start.toString());
      deal.end.toString().should.be.equal(maturity.toString());

      let schedule = await loan.getPaymentSchedule(dealId);
      schedule[1].map((amount, i) => {
        if (i != 5 && i != 0) {
          amount.toString().should.be.equal(coupon.toString());
        } else if (i != 0) {
          amount.toString().should.be.equal(repayment.toString());
        }
      });

      const slotTimeTest = await timeLibrary.addDays(start, 365);
      const slotDateTest = await timeLibrary.timestampToDate(slotTimeTest);
      const slotPosition = hashPosition(
        slotDateTest.year.toNumber(),
        slotDateTest.month.toNumber(),
        slotDateTest.day.toNumber(),
      );

      const actualSlotPosition = await timeSlotTest.position(
        slotDateTest.year,
        slotDateTest.month,
        slotDateTest.day,
      );

      slotPosition.should.be.equal(actualSlotPosition);

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _1yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(coupon.toString());

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _2yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(coupon.toString());

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(coupon.toString());

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _4yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(coupon.toString());

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _5yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal(repayment.toString());

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexFILString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutPayment.toString());
      closeOut.flipped.should.be.equal(true);
    });

    it('Check locked collateral amounts', async () => {
      let aliceFILInETH = await currencyController.convertToETH(
        hexFILString,
        aliceFIlUsed,
      );
      let bobFILInETH = await currencyController.convertToETH(
        hexFILString,
        bobFILUsed,
      );

      let lockedCollateral = await ethVault['getLockedCollateral(address)'](
        alice,
      );
      lockedCollateral.toString().should.be.equal(aliceFILInETH.toString());

      lockedCollateral = await ethVault['getLockedCollateral(address)'](bob);
      lockedCollateral.toString().should.be.equal(bobFILInETH.toString());

      let lockedCollaterals = await ethVault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      lockedCollaterals[0].toString().should.be.equal(aliceFILInETH.toString());
      lockedCollaterals[1].toString().should.be.equal(bobFILInETH.toString());
    });

    it('Try to get last settled payment, verify payment from lender', async () => {
      let payment = await loan.getLastSettledPayment(dealId);
      payment.toString().should.be.equal('0');

      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 2);
      let slotDate = await timeLibrary.timestampToDate(slotTime);
      slotPosition = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            filAmount.toString(),
            slotTime.toString(),
            testTxHash,
          )
      ).wait();

      aliceRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      let presentValue = await loan.getDealPV(dealId);

      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob before notional exchange: ' +
          presentValue.toString(),
      );
      console.log('');
    });

    it('Try to settle payment by chainlink external adapter and check last settlement payment', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 2);
      let slotDate = await timeLibrary.timestampToDate(slotTime);
      slotPosition = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexFILString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutPayment.toString());
      closeOut.flipped.should.be.equal(true);

      await settlementAdapter.fulfill(
        aliceRequestId,
        aliceFILAddress,
        bobFILAddress,
        filAmount.toString(),
        slotTime.toString(),
        testTxHash,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        slotPosition,
      );
      timeSlot[0].toString().should.be.equal(filAmount.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(filAmount.toString());
      timeSlot[3].toString().should.be.equal(filAmount.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);

      let settlementId = computeCrosschainSettlementId(testTxHash);

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexFILString,
          slotPosition,
          settlementId,
        );
      confirmation[0].should.be.equal(alice);
      confirmation[1].toString().should.be.equal(filAmount.toString());

      closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexFILString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutPayment.add(filAmount).toString());
      closeOut.flipped.should.be.equal(true);

      let payment = await loan.getLastSettledPayment(dealId);
      payment.toString().should.be.equal('0');

      let presentValue = await loan.getDealPV(dealId);

      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after notional exchange: ' +
          presentValue.toString(),
      );
      console.log('');
    });

    it('Shift yield curve by 1 percent upwards, calculate present value to see the difference', async () => {
      const lendRates = [1020, 1120, 1220, 1320, 1420, 1620];
      const borrowRates = [880, 980, 1080, 1180, 1280, 1480];
      const midRates = [950, 1050, 1150, 1250, 1350, 1550];

      let tx = await lendingMarketController.setBorrowRatesForCcy(
        hexFILString,
        borrowRates,
      );
      tx = await lendingMarketController.setLendRatesForCcy(
        hexFILString,
        lendRates,
      );
      let rates = await lendingMarketController.getMidRatesForCcy(hexFILString);
      rates.map((rate, i) => {
        rate.toNumber().should.be.equal(midRates[i]);
      });

      let presentValue = await loan.getDealPV(dealId);
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after yield curve shift: ' +
          presentValue.toString(),
      );
      console.log('');
    });

    it('Shift yield curve by 2 percent down, calculate present value to see the difference', async () => {
      const lendRates = [820, 920, 1020, 1120, 1220, 1420];
      const borrowRates = [680, 780, 880, 980, 1080, 1280];
      const midRates = [750, 850, 950, 1050, 1150, 1350];

      let tx = await lendingMarketController.setBorrowRatesForCcy(
        hexFILString,
        borrowRates,
      );
      tx = await lendingMarketController.setLendRatesForCcy(
        hexFILString,
        lendRates,
      );
      let rates = await lendingMarketController.getMidRatesForCcy(hexFILString);
      rates.map((rate, i) => {
        rate.toNumber().should.be.equal(midRates[i]);
      });

      let presentValue = await loan.getDealPV(dealId);
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after another yield curve shift: ' +
          presentValue.toString(),
      );
      console.log('');
    });

    it('Try to request/reject early termination of the deal', async () => {
      await loan.connect(signers[1]).requestTermination(dealId);
      await expectRevert(
        loan.acceptTermination(dealId),
        'borrower must accept',
      );
      await loan.connect(signers[2]).rejectTermination(dealId);
    });

    it('Try to successfully terminate the deal after 30 days', async () => {
      await advanceTime(30 * ONE_DAY);

      let presentValue = await loan.getDealPV(dealId);
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after 1 month shift: ' +
          presentValue.toString(),
      );
      console.log('');

      await loan.connect(signers[1]).requestTermination(dealId);
      await loan.connect(signers[2]).acceptTermination(dealId);

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _1yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal('0');

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _2yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal('0');

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _3yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal('0');

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _4yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal('0');

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _5yearTimeSlot,
      );
      timeSlot[2].toString().should.be.equal('0');

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexFILString,
      );
      closeOut.netPayment.toString().should.be.equal('0');

      // let position = await collateralAggregator.getBilateralPosition(alice, bob);
      // TODO: Add automatic collateral rebalance on terminating the deal and releasing collateral
      // position.lockedCollateralA.should.be.equal(bobFILInETH.toString());
      // position.lockedCollateralB.should.be.equal(aliceFILInETH.toString());
    });
  });

  describe('Test the execution of loan deal between Bob and Alice, try to successfully execute the deal', async () => {
    const rate = toBN(700);
    let filAmount = toBN('10000000000000000000');
    let filUsed = filAmount.mul(toBN(2000)).div(toBN(10000));
    let aliceFIlUsed = filAmount.mul(toBN(15000)).div(toBN(10000));
    let bobFILUsed = filUsed.mul(toBN(15000)).div(toBN(10000));

    const dealId = generateId(2, loanPrefix);
    const annualCoupon = filAmount.mul(rate).div(IR_BASE);
    const coupon = annualCoupon.div(toBN('4'));
    const repayment = filAmount.add(coupon);
    const closeOutPayment = filAmount.add(coupon.sub(filAmount));

    let start;
    let maturity;
    let slotDate;
    let slotPosition;
    let timeSlot;

    let testTxHash = toBytes32('0xTestTxHash2');

    it('Deposit more collateral for Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      const depositAmt = toBN('9000000000000000000');
      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      let initialIndependentAmount = toBN(independentCollateral);

      await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      independentCollateral = await ethVault.getIndependentCollateral(alice);
      independentCollateral
        .toString()
        .should.be.equal(
          initialIndependentAmount.add(toBN('9000000000000000000')).toString(),
        );
    });

    it('Register new loan deal between Bob and Alice', async () => {
      await collateralCaller.useUnsettledCollateral(bob, hexFILString, filUsed);

      await loanCaller.register(
        bob,
        alice,
        0,
        hexFILString,
        '90',
        filAmount,
        rate,
      );
      start = await timeLibrary._now();
      maturity = await timeLibrary.addDays(start, 90);
      slotDate = await timeLibrary.timestampToDate(maturity);
      slotPosition = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      let deal = await loan.getLoanDeal(dealId);
      deal.lender.should.be.equal(bob);
      deal.borrower.should.be.equal(alice);
      deal.ccy.should.be.equal(hexFILString);
      deal.term.toString().should.be.equal('90');
      deal.notional.toString().should.be.equal(filAmount.toString());
      deal.rate.toString().should.be.equal(rate.toString());
      deal.start.toString().should.be.equal(start.toString());
      deal.end.toString().should.be.equal(maturity.toString());

      let schedule = await loan.getPaymentSchedule(dealId);
      schedule[1][1].toString().should.be.equal(repayment.toString());
      schedule[0][1].toString().should.be.equal(maturity.toString());

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexFILString,
        slotPosition,
      );
      timeSlot[2].toString().should.be.equal(repayment.toString());

      let closeOut = await closeOutNetting.getCloseOutPayment(
        alice,
        bob,
        hexFILString,
      );
      closeOut.netPayment
        .toString()
        .should.be.equal(closeOutPayment.toString());

      let presentValue = await loan.getDealPV(dealId);
      presentValue.toString().should.be.equal(filAmount.toString());
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob before settlement is: ' +
          presentValue.toString(),
      );
      console.log('');
    });

    it('Succesfully settle the notional transaction by the lender', async () => {
      now = await getLatestTimestamp();
      let slotTime = await timeLibrary.addDays(now, 2);
      let slotDate = await timeLibrary.timestampToDate(slotTime);
      slotPosition = await timeSlotTest.position(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      const requestId = await (
        await settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexFILString,
            filAmount.toString(),
            slotTime.toString(),
            secondTxHash,
          )
      ).wait();

      bobRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;

      await settlementAdapter.fulfill(
        bobRequestId,
        bobFILAddress,
        aliceFILAddress,
        filAmount.toString(),
        slotTime.toString(),
        secondTxHash,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexFILString,
        slotPosition,
      );
      timeSlot[0].toString().should.be.equal(filAmount.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(filAmount.toString());
      timeSlot[3].toString().should.be.equal(filAmount.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);

      let settlementId = computeCrosschainSettlementId(secondTxHash);

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          alice,
          bob,
          hexFILString,
          slotPosition,
          settlementId,
        );
      confirmation[0].should.be.equal(bob);
      confirmation[1].toString().should.be.equal(filAmount.toString());

      let presentValue = await loan.getDealPV(dealId);
      // presentValue.toString().should.be.equal(filAmount.toString());
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob before settlement is: ' +
          presentValue.toString(),
      );
      console.log('');
    });
  });
});
