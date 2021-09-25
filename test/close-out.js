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

            if (addrPack[1] == true) {
                await closeOutTest.addPayments(addrPack[0], bobPayment, alicePayment);
                
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            } else {
                await closeOutTest.addPayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            }
        });

        it('Add more payments into close out payment, expect close out to flip', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 30000;
            let bobPayment = 0;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            if (addrPack[1] == true) {
                await closeOutTest.addPayments(addrPack[0], bobPayment, alicePayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            } else {
                await closeOutTest.addPayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            }
        });

        it('Add payments into close out payment, expect close out net payment to be 0', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 5000;
            let bobPayment = 30000;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            if (addrPack[1] == true) {
                await closeOutTest.addPayments(addrPack[0], bobPayment, alicePayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            } else {
                await closeOutTest.addPayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            }
        });

        it('Add payments into close out payment, expect close out to be not flipped', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let alicePayment = 15000;
            let bobPayment = 50000;

            aliceTotalPayment = aliceTotalPayment + alicePayment;
            bobTotalPayment = bobTotalPayment + bobPayment;

            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            if (addrPack[1] == true) {
                await closeOutTest.addPayments(addrPack[0], bobPayment, alicePayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            } else {
                await closeOutTest.addPayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            }
        });

        // it('Add payments into close out payment 5th', async () => {
        //     let addrPack = await addressPacking.pack(bob, alice);
        //     let alicePayment = 50000;
        //     let bobPayment = 15000;

        //     aliceTotalPayment = aliceTotalPayment + alicePayment;
        //     bobTotalPayment = bobTotalPayment + bobPayment;
        //     netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

        //     if (addrPack[1] == true) {
        //         await closeOutTest.addPayments(addrPack[0], alicePayment, bobPayment);
        //         closeOutPayment = await closeOutTest.get(addrPack[0]);
        //         closeOutPayment.netPayment.should.be.equal(netPayment.toString());
        //         closeOutPayment.flipped.should.be.equal(false);
        //     } else {
        //         await closeOutTest.addPayments(addrPack[0], bobPayment, alicePayment);
        //         closeOutPayment = await closeOutTest.get(addrPack[0]);
        //         closeOutPayment.netPayment.should.be.equal(netPayment.toString());
        //         closeOutPayment.flipped.should.be.equal(true);
        //     }
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

            if (addrPack[1] == true) {
                await closeOutTest.removePayments(addrPack[0], bobPayment, alicePayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            } else {
                await closeOutTest.removePayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            }
        });

        it('Remove more payments from close out payment, expect net payment to be increased', async () => {
            let addrPack = await addressPacking.pack(bob, alice);
            let alicePayment = 20000;
            let bobPayment = 10000;
            let closeOutPayment;

            aliceTotalPayment = aliceTotalPayment - alicePayment;
            bobTotalPayment = bobTotalPayment - bobPayment;
            netPayment = aliceTotalPayment > bobTotalPayment ? aliceTotalPayment - bobTotalPayment : bobTotalPayment - aliceTotalPayment;

            if (addrPack[1] == true) {
                await closeOutTest.removePayments(addrPack[0], alicePayment, bobPayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(true);
            } else {
                await closeOutTest.removePayments(addrPack[0], bobPayment, alicePayment);
                closeOutPayment = await closeOutTest.get(addrPack[0]);
                closeOutPayment.netPayment.should.be.equal(netPayment.toString());
                closeOutPayment.flipped.should.be.equal(false);
            }
        });
    });

    describe('Close function', () => {
        it('Close the close out payment amount', async () => {
            let addrPack = await addressPacking.pack(alice, bob);
            let sampleTxHash = toBytes32("sampleTxHash");
            
            await closeOutTest.close(addrPack[0], sampleTxHash);
            closeOutPayment = await closeOutTest.get(addrPack[0]);
            closeOutPayment.paymentProof.should.be.equal(sampleTxHash);
        });
    });

});