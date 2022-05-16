const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const utils = require('web3-utils');

const { PrintTable } = require('../test-utils').helper;

should();

contract('DealIdTest', async () => {
  let dealIdTest;

  let dealId;
  let prefix = '0x21aaa47b';
  const words = 64;

  const generateId = (value) => {
    let right = utils.toBN(utils.rightPad(prefix, words));
    let left = utils.toBN(utils.leftPad(value, words));

    let id = utils.numberToHex(right.or(left));

    return id;
  };

  before('deploy DealIdTest', async () => {
    const DealId = await ethers.getContractFactory('DealId');
    const dealIdLibrary = await DealId.deploy();
    await dealIdLibrary.deployed();

    const dealIdTestFactory = await ethers.getContractFactory('DealIdTest', {
      libraries: {
        DealId: dealIdLibrary.address,
      },
    });
    dealIdTest = await dealIdTestFactory.deploy();
  });

  describe('Test deal id generation for various of deal numbers', () => {
    it('Test generating deal with number 1', async () => {
      const numId = 1;
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);

      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 124678', async () => {
      const numId = 124678;
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);

      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 2356789352', async () => {
      const numId = 2356789352;
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);

      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 345678562395236902356', async () => {
      const numId = utils.toBN('345678562395236902356').toString();
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);

      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 2^128, expect successful id generation', async () => {
      const numId = utils
        .toBN('340282366920938463463374607431768211456')
        .toString();
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);

      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 2^224, expect revert', async () => {
      const numId = utils
        .toBN(
          '26959946667150639794667015087019630673637144422540572481103610249216',
        )
        .toString();
      await expectRevert(dealIdTest.generate(numId), 'NUMBER_OVERFLOW');
    });

    it('Test generating deal with number 2^224 - 1, expect successful ID generation', async () => {
      const numId = utils
        .toBN(
          '26959946667150639794667015087019630673637144422540572481103610249215',
        )
        .toString();
      dealId = await dealIdTest.generate(numId);
      const id = generateId(numId);
      dealId.should.be.equal(id);
    });

    it('Test generating deal with number 2^225, expect revert', async () => {
      const numId = utils
        .toBN(
          '53919893334301279589334030174039261347274288845081144962207220498432',
        )
        .toString();

      await expectRevert(dealIdTest.generate(numId), 'NUMBER_OVERFLOW');
    });
  });

  describe('Test deal id prefix extraction', () => {
    it('Test deal prefix extraction for deal with counter 1', async () => {
      const numId = 1;
      const id = generateId(numId);

      const dealPrefix = await dealIdTest.getPrefix(id);
      dealPrefix.should.be.equal(prefix);
    });

    it('Test deal prefix extraction for deal with counter 345678562395236902356', async () => {
      const numId = 345678562395236902356;
      const id = generateId(numId);

      const dealPrefix = await dealIdTest.getPrefix(id);
      dealPrefix.should.be.equal(prefix);
    });

    it('Test generating deal with number 2^224 - 1, expect successful ID generation', async () => {
      const numId = utils
        .toBN(
          '26959946667150639794667015087019630673637144422540572481103610249215',
        )
        .toString();
      const id = generateId(numId);

      const dealPrefix = await dealIdTest.getPrefix(id);
      dealPrefix.should.be.equal(prefix);
    });
  });

  describe('Calculate gas costs', () => {
    it('Gas costs for ID generation', async () => {
      const gasCostTable = new PrintTable('GasCost');
      let numIds = [
        1,
        124678,
        2356789352,
        '340282366920938463463374607431768211456',
        '26959946667150639794667015087019630673637144422540572481103610249215',
      ];

      for (const numId of numIds) {
        await gasCostTable.add(
          `Generate id with number ${Number(numId)}`,
          dealIdTest.getGasCostOfGenerate(numId),
        );
      }
      gasCostTable.log();
    });

    it('Gas costs for prefix extraction', async () => {
      const gasCostTable = new PrintTable('GasCost');
      const numIds = [
        1,
        345678562395236902356,
        '26959946667150639794667015087019630673637144422540572481103610249215',
      ];

      for (const numId of numIds) {
        await gasCostTable.add(
          `Extract prefix for id with number ${Number(numId)}`,
          dealIdTest.getGasCostOfGetPrefix(generateId(numId)),
        );
      }
      gasCostTable.log();
    });
  });
});
