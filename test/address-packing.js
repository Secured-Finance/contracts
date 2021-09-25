const AddressPackingTest = artifacts.require('AddressPackingTest');

const { ethers } = require('hardhat');
const { emitted, reverted, equal } = require('../test-utils').assert;
const { should } = require('chai');
should();

const expectRevert = reverted;

const packAddresses = (flipped, addr0, addr1) => {
  let encodedAddrs;

  if (flipped === true) {
    encodedAddrs = ethers.utils.defaultAbiCoder.encode([ "address", "address" ], [ addr1, addr0 ]);
  } else {
    encodedAddrs = ethers.utils.defaultAbiCoder.encode([ "address", "address" ], [ addr0, addr1 ]);
  }

  return ethers.utils.keccak256(encodedAddrs);
}

contract('AddressPacking', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    let addressPacking
    let zeroAddr = '0x0000000000000000000000000000000000000000';

    beforeEach('deploy AddressPacking', async () => {
      addressPacking = await AddressPackingTest.new();
    });

    describe('Pack function', () => {
        it('pack owner and alice addresses', async () => {
          let packedAddresses = await addressPacking.pack(owner, alice);
          let selfPack = await packAddresses(packedAddresses[1], owner, alice);

          packedAddresses[0].should.be.equal(selfPack);
        });

        it('pack two owner addresses, expect revert', async () => {
          await expectRevert(
            addressPacking.pack(owner, owner), "Identical addresses"
          );
        });

        it('pack zero address and owner address, expect revert', async () => {
          await expectRevert(
            addressPacking.pack(zeroAddr, owner), "Invalid address"
          );
        });

        it('pack alice and bob addresses back and forth', async () => {
          let packedAddresses = await addressPacking.pack(alice, bob);
          let selfPack = await packAddresses(packedAddresses[1], alice, bob);

          packedAddresses[0].should.be.equal(selfPack);

          let invertedPackedAddresses = await addressPacking.pack(bob, alice);
          invertedPackedAddresses[0].should.be.equal(packedAddresses[0]);  
        });

        it('pack alice and zero Address back and forth', async () => {
          let packedAddresses = await addressPacking.pack(alice, zeroAddr);
          let selfPack = await packAddresses(packedAddresses[1], alice, zeroAddr);

          packedAddresses[0].should.be.equal(selfPack);

          await expectRevert(
            addressPacking.pack(zeroAddr, alice), "Invalid address"
          );
        });

        it('pack alice address 2 times, expect revert', async () => {
          await expectRevert(
            addressPacking.pack(alice, alice), "Identical addresses"
          );
        });

        it('calculate gas cost for address packing', async () => {
            let cost = await addressPacking.getGasCostOfPack(alice, carol);

            console.log("Gas Cost for Pack function is " + cost.toString() + " gas");
        });

        it('calculate gas cost for address packing with zero address', async () => {
          let cost = await addressPacking.getGasCostOfPack(alice, zeroAddr);

          console.log("Gas Cost for Pack function is " + cost.toString() + " gas");
      });
    });
});
