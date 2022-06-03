const NetPVTest = artifacts.require('NetPVTest');

const utils = require('web3-utils');
const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { PrintTable } = require('../test-utils').helper;
const { overflowErrorMsg } = require('../test-utils').strings;

should();

contract('NetPVTest', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let netPVTest;
  const ETH = utils.toBN('1000000000000000000');
  const ZERO_BN = utils.toBN('0');

  let aliceUnsettledPV = ZERO_BN;
  let alicePV = ZERO_BN;
  let bobUnsettledPV = ZERO_BN;
  let bobPV = ZERO_BN;

  before('deploy NetPVTest', async () => {
    netPVTest = await NetPVTest.new();
  });

  const validateNetting = async (
    party0,
    party1,
    unsettled0PV,
    party0PV,
    unsettled1PV,
    party1PV,
  ) => {
    let netting = await netPVTest.get(party0, party1);
    netting[0].toString().should.be.equal(unsettled0PV.toString());
    netting[1].toString().should.be.equal(unsettled1PV.toString());
    netting[2].toString().should.be.equal(party0PV.toString());
    netting[3].toString().should.be.equal(party1PV.toString());
  };

  describe('Test net present value usage functions', () => {
    it('Use 5 ETH unsettledPV for Alice in relations with Bob, validate NetPV netting', async () => {
      let useAmt = ETH.mul(utils.toBN(5));
      aliceUnsettledPV = useAmt;

      await netPVTest.use(alice, bob, useAmt, ZERO_BN, false, { from: alice });
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });

    it('Use 25 ETH unsettledPV for Bob in relations with Alice, validate NetPV netting', async () => {
      let useAmt = ETH.mul(utils.toBN(25));
      bobUnsettledPV = useAmt;

      await netPVTest.use(bob, alice, useAmt, ZERO_BN, false, { from: bob });
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });

    it('Use settled 7 ETH and 13 ETH for Alice and Bob, validate NetPV netting', async () => {
      let aliceUseAmt = ETH.mul(utils.toBN(7));
      let bobUseAmt = ETH.mul(utils.toBN(13));
      alicePV = aliceUseAmt;
      bobPV = bobUseAmt;

      await netPVTest.use(alice, bob, aliceUseAmt, bobUseAmt, true, {
        from: alice,
      });
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });
  });

  describe('Test net present value settle functions', () => {
    it('Try to settle 100 ETH for Alice and 50 ETH for Bob, expect revert', async () => {
      let aliceSettleAmt = ETH.mul(utils.toBN(100));
      let bobSettleAmt = ETH.mul(utils.toBN(50));

      await expectRevert(
        netPVTest.settle(alice, bob, aliceSettleAmt, bobSettleAmt),
        overflowErrorMsg,
      );
    });

    it('Try to settle empty netting between Bob and Carol, expect revert', async () => {
      await expectRevert(
        netPVTest.settle(bob, carol, ETH, ETH),
        overflowErrorMsg,
      );
    });

    it('Settle 3 ETH for Alice and 20 ETH for Bob, validate state changes', async () => {
      let aliceSettleAmt = ETH.mul(utils.toBN(3));
      let bobSettleAmt = ETH.mul(utils.toBN(20));

      aliceUnsettledPV = aliceUnsettledPV.sub(aliceSettleAmt);
      bobUnsettledPV = bobUnsettledPV.sub(bobSettleAmt);
      alicePV = alicePV.add(aliceSettleAmt);
      bobPV = bobPV.add(bobSettleAmt);

      await netPVTest.settle(alice, bob, aliceSettleAmt, bobSettleAmt, {
        from: alice,
      });
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });
  });

  describe('Test net present value release functions', () => {
    it('Release available unsettled PV from Alice and Bob, validate state changes', async () => {
      let aliceReleaseAmt = aliceUnsettledPV;
      let bobReleaseAmt = bobUnsettledPV;

      aliceUnsettledPV = ZERO_BN;
      bobUnsettledPV = ZERO_BN;

      await netPVTest.release(
        alice,
        bob,
        aliceReleaseAmt,
        bobReleaseAmt,
        false,
        { from: alice },
      );
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });

    it('Try to release empty unsettled PV between Alice and Bob, expect revert', async () => {
      await expectRevert(
        netPVTest.release(alice, bob, ETH, ETH, false),
        overflowErrorMsg,
      );
    });
  });

  describe('Test net present value updates', () => {
    it('Update 7 ETH to 8 ETH for Alice and 30 ETH to 33 ETH for Bob, validate state changes', async () => {
      let alicePrevPV = ETH.mul(utils.toBN(7));
      let bobPrevPV = ETH.mul(utils.toBN(30));

      let aliceNewPV = ETH.mul(utils.toBN(8));
      let bobNewPV = ETH.mul(utils.toBN(33));

      alicePV = alicePV.sub(alicePrevPV).add(aliceNewPV);
      bobPV = bobPV.sub(bobPrevPV).add(bobNewPV);

      await netPVTest.update(
        alice,
        bob,
        alicePrevPV,
        bobPrevPV,
        aliceNewPV,
        bobNewPV,
      );
      validateNetting(
        alice,
        bob,
        aliceUnsettledPV,
        alicePV,
        bobUnsettledPV,
        bobPV,
      );
    });

    it('Try to update PV more than has been saved previously between Alice and Bob, expect revert', async () => {
      let alicePrevPV = ETH.mul(utils.toBN(10));
      let bobPrevPV = ETH.mul(utils.toBN(40));
      let aliceNewPV = ETH.mul(utils.toBN(15));
      let bobNewPV = ETH.mul(utils.toBN(45));

      await expectRevert(
        netPVTest.update(
          alice,
          bob,
          alicePrevPV,
          bobPrevPV,
          aliceNewPV,
          bobNewPV,
        ),
        overflowErrorMsg,
      );
    });

    it('Try to update in empty netting Bob and Carol, expect revert', async () => {
      let bobNewPV = ETH.mul(utils.toBN(5));
      let carolNewPV = ETH.mul(utils.toBN(2));

      await expectRevert(
        netPVTest.update(bob, carol, ETH, ETH, bobNewPV, carolNewPV),
        overflowErrorMsg,
      );
    });
  });

  describe('Test netting clear function', () => {
    it('Clear netting between Alice and Bob, validate state changes', async () => {
      await netPVTest.clear(alice, bob);
      validateNetting(alice, bob, ZERO_BN, ZERO_BN, ZERO_BN, ZERO_BN);
    });

    it('Clear empty netting, check state changes', async () => {
      await netPVTest.clear(bob, carol);
      validateNetting(bob, carol, ZERO_BN, ZERO_BN, ZERO_BN, ZERO_BN);
    });
  });

  describe('Calculate gas costs', () => {
    it('Gas costs for getting netting structure', async () => {
      const gasCostTable = new PrintTable('GasCost');

      await gasCostTable.add(
        'Get netting between Alice and Bob',
        netPVTest.getGasCostOfGet(alice, bob),
      );

      await gasCostTable.add(
        'Get netting between Alice and Bob in reverse counterparties order',
        netPVTest.getGasCostOfGet(bob, alice),
      );

      gasCostTable.log();
    });
  });
});
