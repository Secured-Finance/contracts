const CloseOutTest = artifacts.require('CloseOutTest');
const AddressPackingTest = artifacts.require('AddressPackingTest');

const { reverted} = require('../test-utils').assert;
const { should } = require('chai');
const {toBytes32} = require('../test-utils').strings;
should();

const expectRevert = reverted;

contract('CloseOutTest', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    let closeOutTest;
    let addressPacking;

    let aliceTotalPayment = 0;
    let bobTotalPayment = 0; 
    let netPayment = 0;

    before('deploy CloseOutTest', async () => {
        closeOutTest = await CloseOutTest.new();
        addressPacking = await AddressPackingTest.new();
    });

    describe('Add payments function', () => {
        it('Add first payments into close out payment', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 10000;
            let bobPayment = 15000;
            let closeOutPayment;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.addPayments(bob, alice, bobPayment, alicePayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        it('Add more payments into close out payment, expect close out to flip', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 30000;
            let bobPayment = 0;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.addPayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(bob, alice);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        it('Add payments into close out payment, expect close out net payment to be 0', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 5000;
            let bobPayment = 30000;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.addPayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        it('Add payments into close out payment, expect close out to be not flipped', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 15000;
            let bobPayment = 50000;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.addPayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        // it('Add payments into close out payment 5th', async () => {
        //     let addrPack = await addressPacking.pack(bob, alice);
        //     let alicePayment = 50000;
        //     let bobPayment = 15000;

        //     aliceTotalPayment = aliceTotalPayment + alicePayment;
        //     bobTotalPayment = bobTotalPayment + bobPayment;
        //     netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

        //     await closeOutTest.addPayments(alice, bob, bobPayment, alicePayment);
        //     closeOutPayment = await closeOutTest.get(alice, bob);
        //     closeOutPayment.netPayment.should.be.equal(netPayment.toString());
        //     closeOutPayment.flipped.should.be.equal(true);
        // });
    });

    describe('Remove payments function', () => {
        it('Remove more payments from close out payment, expect net payment to be reduced', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 10000;
            let bobPayment = 15000;
            let closeOutPayment;

            aliceTotalPayment = aliceTotalPayment - alicePayment;
            bobTotalPayment = bobTotalPayment - bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.removePayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        it('Remove more payments from close out payment, expect net payment to be increased', async () => {
            let addrPack = await addressPacking.pack(bob, alice);
            let alicePayment = 20000;
            let bobPayment = 10000;
            let closeOutPayment;

            aliceTotalPayment = aliceTotalPayment - alicePayment;
            bobTotalPayment = bobTotalPayment - bobPayment;
            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.removePayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });

        it('Remove more payments from close out payment, expect close out to flip', async () => {
            let addrPack = await addressPacking.pack(bob, alice);
            let alicePayment = 0;
            let bobPayment = 65000;
            let closeOutPayment;

            aliceTotalPayment = aliceTotalPayment - alicePayment;
            bobTotalPayment = bobTotalPayment - bobPayment;
            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            await closeOutTest.removePayments(alice, bob, alicePayment, bobPayment);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(false);
        });

        it('Get close out with addresses passed backwards, expect flipped result', async () => {
            closeOutPayment = await closeOutTest.get(bob, alice);
            closeOutPayment.netPayment.should.be.equal(netPayment.toString());
            closeOutPayment.flipped.should.be.equal(true);
        });
    });

    describe('Close function', () => {
        it('Close the close out payment amount', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let sampleTxHash = toBytes32("sampleTxHash");
            
            await closeOutTest.close(alice, bob);
            closeOutPayment = await closeOutTest.get(alice, bob);
            closeOutPayment.closed.should.be.equal(true);
        });
    });

});