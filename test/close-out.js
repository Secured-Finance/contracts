const CloseOutTest = artifacts.require('CloseOutTest');

const { should } = require('chai');
should();

contract('CloseOutTest', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  let closeOutTest;

  let aliceTotalPayment = 0;
  let bobTotalPayment = 0;
  let netPayment = 0;

  before('deploy CloseOutTest', async () => {
    closeOutTest = await CloseOutTest.new();
  });

  describe('Add payments function', () => {
    it('Add first payments into close out payment', async () => {
      let alicePayment = 10000;
      let bobPayment = 15000;
      let closeOutPayment;

      aliceTotalPayment = aliceTotalPayment + alicePayment;
      bobTotalPayment = bobTotalPayment + bobPayment;

      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

      await closeOutTest.addPayments(bob, alice, bobPayment, alicePayment);
      closeOutPayment = await closeOutTest.get(alice, bob);
      closeOutPayment.netPayment.should.be.equal(netPayment.toString());
      closeOutPayment.flipped.should.be.equal(true);
    });

    it('Add more payments into close out payment, expect close out to flip', async () => {
      let alicePayment = 30000;
      let bobPayment = 0;

      aliceTotalPayment = aliceTotalPayment + alicePayment;
      bobTotalPayment = bobTotalPayment + bobPayment;

      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

      await closeOutTest.addPayments(alice, bob, alicePayment, bobPayment);
      closeOutPayment = await closeOutTest.get(bob, alice);
      closeOutPayment.netPayment.should.be.equal(netPayment.toString());
      closeOutPayment.flipped.should.be.equal(true);
    });

    it('Add payments into close out payment, expect close out net payment to be 0', async () => {
      let alicePayment = 5000;
      let bobPayment = 30000;

      aliceTotalPayment = aliceTotalPayment + alicePayment;
      bobTotalPayment = bobTotalPayment + bobPayment;

      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

      await closeOutTest.addPayments(alice, bob, alicePayment, bobPayment);
      closeOutPayment = await closeOutTest.get(alice, bob);
      closeOutPayment.netPayment.should.be.equal(netPayment.toString());
      closeOutPayment.flipped.should.be.equal(true);
    });

    it('Add payments into close out payment, expect close out to be not flipped', async () => {
      let alicePayment = 15000;
      let bobPayment = 50000;

      aliceTotalPayment = aliceTotalPayment + alicePayment;
      bobTotalPayment = bobTotalPayment + bobPayment;

      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

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
      let alicePayment = 10000;
      let bobPayment = 15000;
      let closeOutPayment;

      aliceTotalPayment = aliceTotalPayment - alicePayment;
      bobTotalPayment = bobTotalPayment - bobPayment;

      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

      await closeOutTest.removePayments(alice, bob, alicePayment, bobPayment);
      closeOutPayment = await closeOutTest.get(alice, bob);
      closeOutPayment.netPayment.should.be.equal(netPayment.toString());
      closeOutPayment.flipped.should.be.equal(true);
    });

    it('Remove more payments from close out payment, expect net payment to be increased', async () => {
      let alicePayment = 20000;
      let bobPayment = 10000;
      let closeOutPayment;

      aliceTotalPayment = aliceTotalPayment - alicePayment;
      bobTotalPayment = bobTotalPayment - bobPayment;
      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

      await closeOutTest.removePayments(alice, bob, alicePayment, bobPayment);
      closeOutPayment = await closeOutTest.get(alice, bob);
      closeOutPayment.netPayment.should.be.equal(netPayment.toString());
      closeOutPayment.flipped.should.be.equal(true);
    });

    it('Remove more payments from close out payment, expect close out to flip', async () => {
      let alicePayment = 0;
      let bobPayment = 65000;
      let closeOutPayment;

      aliceTotalPayment = aliceTotalPayment - alicePayment;
      bobTotalPayment = bobTotalPayment - bobPayment;
      netPayment =
        aliceTotalPayment > bobTotalPayment
          ? aliceTotalPayment - bobTotalPayment
          : bobTotalPayment - aliceTotalPayment;

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
      await closeOutTest.close(alice, bob);
      closeOutPayment = await closeOutTest.get(alice, bob);
      closeOutPayment.closed.should.be.equal(true);
    });
  });
});
