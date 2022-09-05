import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Strings library', async () => {
  let stringsLibrary: any;
  let firstString = 'Test string';
  let secondString = 'Test string';
  let hash: any;

  beforeEach('deploy Strings library', async () => {
    const StringsFactory = await ethers.getContractFactory('Strings');
    const stringLibrary = await StringsFactory.deploy();
    await stringLibrary.deployed();

    const StringsTestFactory = await ethers.getContractFactory('StringsTest', {
      libraries: {
        Strings: stringLibrary.address,
      },
    });
    stringsLibrary = await StringsTestFactory.deploy();
  });

  describe('isEqual functionality', () => {
    it('Check two equal strings and validate result', async () => {
      const result = await stringsLibrary.isEqual(firstString, secondString);
      expect(result).to.equal(true);
    });

    it('Check two non-equal strings and validate result', async () => {
      secondString = 'test string';
      const result = await stringsLibrary.isEqual(firstString, secondString);
      expect(result).to.equal(false);
    });

    it('Check string with empty string and validate result', async () => {
      const result = await stringsLibrary.isEqual(firstString, '');
      expect(result).to.equal(false);
    });
  });

  describe('toHex functionality', () => {
    it('Check hash string from the library with actual hash string', async () => {
      hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(firstString));
      const result = await stringsLibrary.toHex(hash);
      expect(result.toLowerCase()).to.equal(hash.toLowerCase());
    });

    it('Check that hash from the library is not equal with invalid hash', async () => {
      secondString = 'invalid string';
      const invalidHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(secondString),
      );
      const result = await stringsLibrary.toHex(invalidHash);
      expect(result.toLowerCase()).to.equal(invalidHash.toLowerCase());
    });
  });

  describe('Report gas consumption of view functions', async () => {
    it('calculate gas cost for isEqual function', async () => {
      secondString = 'Test string';
      let cost = await stringsLibrary.getGasCostOfIsEqual(
        firstString,
        secondString,
      );

      console.log(
        'Gas Cost for isEqual function is ' + cost.toString() + ' gas',
      );
    });

    it('calculate gas cost for toHex function', async () => {
      let cost = await stringsLibrary.getGasCostOfToHex(hash);

      console.log('Gas Cost for toHex function is ' + cost.toString() + ' gas');
    });
  });
});
