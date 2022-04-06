const AddressPackingTest = artifacts.require('AddressPackingTest');

const { ethers } = require('hardhat');
const { emitted, reverted, equal } = require('../test-utils').assert;
const { should } = require('chai');
should();

const expectRevert = reverted;

const packAddresses = (addr0, addr1) => {
  let encodedAddrs;
  let _addr0, _addr1;

  addr0 < addr1
    ? ((_addr0 = addr0), (_addr1 = addr1))
    : ((_addr0 = addr1), (_addr1 = addr0));

  if (_addr0 != addr0) {
    encodedAddrs = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [_addr0, _addr1],
    );
    let packed = ethers.utils.keccak256(encodedAddrs);
    return [packed, true];
  } else {
    encodedAddrs = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [_addr0, _addr1],
    );
    let packed = ethers.utils.keccak256(encodedAddrs);
    return [packed, false];
  }
};

contract('AddressPacking', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  let addressPacking;
  let zeroAddr = '0x0000000000000000000000000000000000000000';

  beforeEach('deploy AddressPacking', async () => {
    addressPacking = await AddressPackingTest.new();
  });

  describe('Pack function', () => {
    it('pack owner and alice addresses', async () => {
      let packedAddresses = await addressPacking.pack(owner, alice);
      let selfPack = await packAddresses(owner, alice);
      let selfPack2 = await packAddresses(alice, owner);

      selfPack[0].should.be.equal(selfPack2[0]);
      packedAddresses[0].should.be.equal(selfPack[0]);
      packedAddresses[0].should.be.equal(selfPack2[0]);
    });

    it('pack two owner addresses, expect revert', async () => {
      await expectRevert(
        addressPacking.pack(owner, owner),
        'Identical addresses',
      );
    });

    it('pack zero address and owner address, expect revert', async () => {
      await expectRevert(
        addressPacking.pack(zeroAddr, owner),
        'Invalid address',
      );
    });

    it('pack alice and bob addresses back and forth', async () => {
      let packedAddresses = await addressPacking.pack(alice, bob);
      console.log(packedAddresses[0].toString());
      let selfPack = await packAddresses(alice, bob);

      packedAddresses[0].should.be.equal(selfPack[0]);

      let invertedPackedAddresses = await addressPacking.pack(bob, alice);
      invertedPackedAddresses[0].should.be.equal(packedAddresses[0]);
    });

    it('pack alice and zero Address back and forth', async () => {
      await expectRevert(
        addressPacking.pack(alice, zeroAddr),
        'Invalid address',
      );

      await expectRevert(
        addressPacking.pack(zeroAddr, alice),
        'Invalid address',
      );
    });

    it('pack alice address 2 times, expect revert', async () => {
      await expectRevert(
        addressPacking.pack(alice, alice),
        'Identical addresses',
      );
    });

    it('calculate gas cost for address packing', async () => {
      let cost = await addressPacking.getGasCostOfPack(alice, carol);

      console.log('Gas Cost for Pack function is ' + cost.toString() + ' gas');
    });

    it('calculate gas cost for address packing for alice and bob', async () => {
      let cost = await addressPacking.getGasCostOfPack(alice, bob);

      console.log('Gas Cost for Pack function is ' + cost.toString() + ' gas');
    });
  });
});
