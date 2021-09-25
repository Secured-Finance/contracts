const TimeSlotTest = artifacts.require('TimeSlotTest');
const AddressPackingTest = artifacts.require('AddressPackingTest');

const { ethers } = require('hardhat');
const { reverted} = require('../test-utils').assert;
const { should } = require('chai');
const {toBytes32} = require('../test-utils').strings;
should();

const expectRevert = reverted;
  
const hashPosition = (year, month, day) => {
    let encodedPosition = ethers.utils.defaultAbiCoder.encode([ "uint256", "uint256", "uint256" ], [ year, month, day ]);

    return ethers.utils.keccak256(encodedPosition);
}

contract('TimeSlotTest', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    let timeSlotTest;
    let addressPacking;
    let zeroAddr = '0x0000000000000000000000000000000000000000';
    let zeroString = '0x0000000000000000000000000000000000000000000000000000000000000000';

    let firstTxHash = toBytes32("0xFirstTestTx");
    let secondTxHash = toBytes32("0xSecondTestTx");

    before('deploy TimeSlotTest', async () => {
        timeSlotTest = await TimeSlotTest.new();
        addressPacking = await AddressPackingTest.new();
    });

    describe('Position function', () => {
        it('Calculate time slot position for middle of 2021', async () => {
            let position = await timeSlotTest.position(2021, 6, 15, {from: owner});
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
  
            console.log("Gas Cost for hashing time slot position is " + cost.toString() + " gas");
        })
    });

    describe('Add payment and remove payment functions', async () => {
        let packedAddresses;
        let position;

        it('Add payment for time slot at 6 October 2021', async () => {
            packedAddresses = await addressPacking.pack(alice, bob);
            position = await timeSlotTest.position(2021, 10, 6);
            let alicePayment = 5000;
            let bobPayment = 10000;

            if (packedAddresses[1] != true) {
                tx = await timeSlotTest.addPayment(packedAddresses[0], position, alicePayment, bobPayment);
            } else {
                tx = await timeSlotTest.addPayment(packedAddresses[0], position, bobPayment, alicePayment);
            }

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.totalPayment0.should.be.equal('10000');
            slot.totalPayment1.should.be.equal('5000');
            slot.netPayment.should.be.equal('5000');
            slot.flipped.should.be.equal(false);
        });

        it('Add one more payment for time slot at the same date', async () => {
            let alicePayment = 15000;
            let bobPayment = 0;

            if (packedAddresses[1] != true) {
                await timeSlotTest.addPayment(packedAddresses[0], position, alicePayment, bobPayment);
            } else {
                await timeSlotTest.addPayment(packedAddresses[0], position, bobPayment, alicePayment);
            }

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.totalPayment0.should.be.equal('10000');
            slot.totalPayment1.should.be.equal('20000');
            slot.netPayment.should.be.equal('10000');
            slot.flipped.should.be.equal(true);
        });

        it('Remove one payment from time slot at the same date', async () => {
            let alicePayment = 15000;
            let bobPayment = 0;

            if (packedAddresses[1] != true) {
                await timeSlotTest.removePayment(packedAddresses[0], position, alicePayment, bobPayment);
            } else {
                await timeSlotTest.removePayment(packedAddresses[0], position, bobPayment, alicePayment);
            }

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.totalPayment0.should.be.equal('10000');
            slot.totalPayment1.should.be.equal('5000');
            slot.netPayment.should.be.equal('5000');
            slot.flipped.should.be.equal(false);
        });

        it('Expect revert on removing payment bigger than available total payment', async () => {
            let alicePayment = 10000;
            let bobPayment = 15000;

            if (packedAddresses[1] != true) {
                await expectRevert(
                    timeSlotTest.removePayment(packedAddresses[0], position, alicePayment, bobPayment), "SafeMath: subtraction overflow"
                );
            } else {
                await expectRevert(
                    timeSlotTest.removePayment(packedAddresses[0], position, bobPayment, alicePayment), "SafeMath: subtraction overflow"
                );
            }
        });

        it('Verify net payment from time slot at the same date', async () => {
            await timeSlotTest.verifyPayment(packedAddresses[0], position, 5000, firstTxHash, { from: bob });

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.netPayment.should.be.equal('5000');
            slot.flipped.should.be.equal(false);
            slot.paymentProof.should.be.equal(firstTxHash);
            slot.verificationParty.should.be.equal(bob);
            slot.isSettled.should.be.equal(false);
        });
        
        it('Settle net payment from time slot at the same date', async () => {
            await timeSlotTest.settlePayment(packedAddresses[0], position, 5000, firstTxHash, { from: alice });
            (await timeSlotTest.isSettled(packedAddresses[0], position)).should.be.equal(true);

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.netPayment.should.be.equal('5000');
            slot.flipped.should.be.equal(false);
            slot.paymentProof.should.be.equal(firstTxHash);
            slot.verificationParty.should.be.equal(bob);
            slot.isSettled.should.be.equal(true);
        });

        it('Gas cost for isSettled validation', async () => {
            let gasCost = await timeSlotTest.getGasCostOfIsSettled(packedAddresses[0], position);

            console.log("Gas cost for isSettled validation is " + gasCost.toString() + " gas");
        });

        it('Try to remove payment from settled time slot, expect revert', async () => {
            await expectRevert(
                timeSlotTest.removePayment(packedAddresses[0], position, 10000, 5000), "TIMESLOT SETTLED ALREADY"
            );
        });

        it('Clear time slot state', async () => {
            await timeSlotTest.clear(packedAddresses[0], position);

            let slot = await timeSlotTest.get(packedAddresses[0], 2021, 10, 6);
            slot.totalPayment0.should.be.equal('0');
            slot.totalPayment1.should.be.equal('0');
            slot.netPayment.should.be.equal('0');
            slot.flipped.should.be.equal(false);
            slot.paymentProof.should.be.equal(zeroString);
            slot.verificationParty.should.be.equal(zeroAddr);
            slot.isSettled.should.be.equal(false);
        });
    });
});