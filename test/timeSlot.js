const TimeSlotTest = artifacts.require('TimeSlotTest');
const AddressPackingTest = artifacts.require('AddressPackingTest');

const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { toBytes32, zeroAddress, overflowErrorMsg } =
  require('../test-utils').strings;
should();

const { hashPosition } = require('../test-utils').timeSlot;

contract('TimeSlotTest', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  let timeSlotTest;
  let addressPacking;

  let firstTxHash = toBytes32('0xFirstTestTx');
  let secondTxHash = toBytes32('0xSecondTestTx');

  before('deploy TimeSlotTest', async () => {
    timeSlotTest = await TimeSlotTest.new();
    addressPacking = await AddressPackingTest.new();
  });

  describe('Position function', () => {
    it('Calculate time slot position for middle of 2021', async () => {
      let position = await timeSlotTest.position(2021, 6, 15, { from: owner });
      let selfPosition = hashPosition(2021, 6, 15);

      position.should.be.equal(selfPosition);
    });

    it('Calculate time slot position for maximum date (2345.12.31)', async () => {
      let position = await timeSlotTest.position(2345, 12, 31);
      let selfPosition = hashPosition(2345, 12, 31);

      position.should.be.equal(selfPosition);
    });

    it('Calculate time slot position for minimum date (1970.01,01)', async () => {
      let position = await timeSlotTest.position(1970, 1, 1);
      let selfPosition = hashPosition(1970, 1, 1);

      position.should.be.equal(selfPosition);
    });

    it('Gas cost for hashing time slot position', async () => {
      let cost = await timeSlotTest.getGasCostOfPosition(2021, 6, 15);

      console.log(
        'Gas Cost for hashing time slot position is ' +
          cost.toString() +
          ' gas',
      );
    });
  });

  describe('Add payment and remove payment functions', async () => {
    let packedAddresses;
    let position;

    it('Add payment for time slot at 6 October 2021', async () => {
      packedAddresses = await addressPacking.pack(alice, bob);
      position = await timeSlotTest.position(2021, 10, 6);
      let alicePayment = 5000;
      let bobPayment = 10000;

      tx = await timeSlotTest.addPayment(
        alice,
        bob,
        position,
        alicePayment,
        bobPayment,
      );

      let slot = await timeSlotTest.get(alice, bob, 2021, 10, 6);
      slot[0].toString().should.be.equal('5000');
      slot[1].toString().should.be.equal('10000');
      slot[2].toString().should.be.equal('5000');
      slot[3].toString().should.be.equal('0');
      slot[4].should.be.equal(true);
    });

    it('Add one more payment for time slot at the same date', async () => {
      let alicePayment = 15000;
      let bobPayment = 0;

      await timeSlotTest.addPayment(
        alice,
        bob,
        position,
        alicePayment,
        bobPayment,
      );

      let slot = await timeSlotTest.get(alice, bob, 2021, 10, 6);
      slot[0].toString().should.be.equal('20000');
      slot[1].toString().should.be.equal('10000');
      slot[2].toString().should.be.equal('10000');
      slot[3].toString().should.be.equal('0');
      slot[4].should.be.equal(false);
    });

    it('Remove one payment from time slot at the same date', async () => {
      let alicePayment = 15000;
      let bobPayment = 0;

      await timeSlotTest.removePayment(
        alice,
        bob,
        position,
        alicePayment,
        bobPayment,
      );

      let slot = await timeSlotTest.get(alice, bob, 2021, 10, 6);
      slot[0].toString().should.be.equal('5000');
      slot[1].toString().should.be.equal('10000');
      slot[2].toString().should.be.equal('5000');
      slot[3].toString().should.be.equal('0');
      slot[4].should.be.equal(true);
    });

    it('Expect revert on removing payment bigger than available total payment', async () => {
      let alicePayment = 10000;
      let bobPayment = 15000;

      await expectRevert(
        timeSlotTest.removePayment(
          alice,
          bob,
          position,
          alicePayment,
          bobPayment,
        ),
        overflowErrorMsg,
      );
    });

    it('Verify partial payment for a time slot at the same date', async () => {
      await timeSlotTest.verifyPayment(alice, position, 1000, firstTxHash, {
        from: bob,
      });

      let slot = await timeSlotTest.get(bob, alice, 2021, 10, 6);
      slot[2].toString().should.be.equal('5000');
      slot[3].toString().should.be.equal('1000');
      slot[4].should.be.equal(false);
      slot[5].should.be.equal(false);

      let confirmation = await timeSlotTest.getPaymentConfirmation(
        bob,
        alice,
        2021,
        10,
        6,
        firstTxHash,
      );
      confirmation[0].should.be.equal(bob);
      confirmation[1].toString().should.be.equal('1000');
    });

    it('Try to verify net payment for the same time slot, expect payment overflow', async () => {
      await expectRevert(
        timeSlotTest.verifyPayment(alice, position, 5000, secondTxHash, {
          from: bob,
        }),
        'Payment overflow',
      );

      let slot = await timeSlotTest.get(bob, alice, 2021, 10, 6);
      slot[2].toString().should.be.equal('5000');
      slot[3].toString().should.be.equal('1000');
      slot[4].should.be.equal(false);
      slot[5].should.be.equal(false);

      let confirmation = await timeSlotTest.getPaymentConfirmation(
        bob,
        alice,
        2021,
        10,
        6,
        secondTxHash,
      );
      confirmation[0].should.be.equal(zeroAddress);
      confirmation[1].toString().should.be.equal('0');
    });

    it('Verify the rest of the payment for a time slot at the same date, expect correct settlement', async () => {
      await timeSlotTest.verifyPayment(alice, position, 4000, secondTxHash, {
        from: bob,
      });

      let slot = await timeSlotTest.get(bob, alice, 2021, 10, 6);
      slot[2].toString().should.be.equal('5000');
      slot[3].toString().should.be.equal('5000');
      slot[4].should.be.equal(false);
      slot[5].should.be.equal(true);

      let confirmation = await timeSlotTest.getPaymentConfirmation(
        bob,
        alice,
        2021,
        10,
        6,
        secondTxHash,
      );
      confirmation[0].should.be.equal(bob);
      confirmation[1].toString().should.be.equal('4000');
    });

    it('Gas cost for isSettled validation', async () => {
      let gasCost = await timeSlotTest.getGasCostOfIsSettled(
        alice,
        bob,
        position,
      );

      console.log(
        'Gas cost for isSettled validation is ' + gasCost.toString() + ' gas',
      );
    });

    it('Try to remove payment from settled time slot, expect revert', async () => {
      await expectRevert(
        timeSlotTest.removePayment(alice, bob, position, 10000, 5000),
        'TIMESLOT SETTLED ALREADY',
      );
    });

    it('Clear time slot state', async () => {
      await timeSlotTest.clear(alice, bob, position);

      let slot = await timeSlotTest.get(alice, bob, 2021, 10, 6);
      slot[0].toString().should.be.equal('0');
      slot[1].toString().should.be.equal('0');
      slot[2].toString().should.be.equal('0');
      slot[3].toString().should.be.equal('0');
      slot[4].should.be.equal(false);
      slot[5].should.be.equal(false);
    });
  });
});
