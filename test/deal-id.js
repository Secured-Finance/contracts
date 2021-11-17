const { should } = require('chai');
const { ethers } = require('hardhat');
const { reverted} = require('../test-utils').assert;
const utils = require('web3-utils');
const expectRevert = reverted;

should();

contract('DealIdTest', async () => {
    let dealIdTest;

    let dealId;
    let prefix = "0x21aaa47b";
    const words = 64;

    const generateId = (value) => {
        let right = utils.toBN(utils.rightPad(prefix, words));
        let left = utils.toBN(utils.leftPad(value, words));
    
        let id = utils.numberToHex(right.or(left));

        return id;
    };
    
    before('deploy DealIdTest', async () => {    
        const DealId = await ethers.getContractFactory('DealId')
        const dealIdLibrary = await DealId.deploy();
        await dealIdLibrary.deployed();

        const dealIdTestFactory = await ethers.getContractFactory(
            'DealIdTest',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
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
            const numId = utils.toBN('340282366920938463463374607431768211456').toString();
            dealId = await dealIdTest.generate(numId);
            const id = generateId(numId);

            dealId.should.be.equal(id);
        });

        it('Test generating deal with number 2^224, expect revert', async () => {
            const numId = utils.toBN('26959946667150639794667015087019630673637144422540572481103610249216').toString();
            await expectRevert(
                dealIdTest.generate(numId), "NUMBER_OVERFLOW"
            );
        });

        it('Test generating deal with number 2^224 - 1, expect successfull ID generation', async () => {
            const numId = utils.toBN('26959946667150639794667015087019630673637144422540572481103610249215').toString();
            dealId = await dealIdTest.generate(numId);
            const id = generateId(numId);
            dealId.should.be.equal(id);
        });

        it('Test generating deal with number 2^225, expect revert', async () => {
            const numId = utils.toBN('53919893334301279589334030174039261347274288845081144962207220498432').toString();
            
            await expectRevert(
                dealIdTest.generate(numId), "NUMBER_OVERFLOW"
            );
        });
    });

    describe('Test deal id prefix extraction', () => {
        it('Test deal prefix extraction for deal with counter 1', async () => {
            const numId = 1;
            const id = generateId(numId);

            const dealPrefix  = await dealIdTest.getPrefix(id);
            dealPrefix.should.be.equal(prefix);
        });

        it('Test deal prefix extraction for deal with counter 345678562395236902356', async () => {
            const numId = 345678562395236902356;
            const id = generateId(numId);

            const dealPrefix  = await dealIdTest.getPrefix(id);
            dealPrefix.should.be.equal(prefix);
        });

        it('Test generating deal with number 2^224 - 1, expect successfull ID generation', async () => {
            const numId = utils.toBN('26959946667150639794667015087019630673637144422540572481103610249215').toString();
            const id = generateId(numId);
            
            const dealPrefix  = await dealIdTest.getPrefix(id);
            dealPrefix.should.be.equal(prefix);
        });

    });

    describe('Calculate gas costs', () => {
        it('Gas costs for ID generation', async () => {
            let numId = 1;

            let gasCost = await dealIdTest.getGasCostOfGenerate(numId);
            console.log("Gas cost for generating id with number 1 is " + gasCost.toString() + " gas");

            numId = 124678;
            gasCost = await dealIdTest.getGasCostOfGenerate(numId);
            console.log("Gas cost for generating id with number 124678 is " + gasCost.toString() + " gas");

            numId = 2356789352;
            gasCost = await dealIdTest.getGasCostOfGenerate(numId);
            console.log("Gas cost for generating id with number 2356789352 is " + gasCost.toString() + " gas");

            numId = '340282366920938463463374607431768211456';
            gasCost = await dealIdTest.getGasCostOfGenerate(numId);
            console.log("Gas cost for generating id with number 2^128 is " + gasCost.toString() + " gas");

            numId = '26959946667150639794667015087019630673637144422540572481103610249215';
            gasCost = await dealIdTest.getGasCostOfGenerate(numId);
            console.log("Gas cost for generating id with number 2^224 - 1 is " + gasCost.toString() + " gas");
        });

        it('Gas costs for prefix extraction', async () => {
            let numId = 1;
            let id = generateId(numId);

            let gasCost = await dealIdTest.getGasCostOfGetPrefix(id);
            console.log("Gas cost for extracting prefix for id with number 1 is " + gasCost.toString() + " gas");

            numId = 345678562395236902356;
            id = generateId(numId);

            gasCost = await dealIdTest.getGasCostOfGetPrefix(id);
            console.log("Gas cost for extracting prefix for id with number 345678562395236902356 is " + gasCost.toString() + " gas");

            numId = '26959946667150639794667015087019630673637144422540572481103610249215';
            id = generateId(numId);

            gasCost = await dealIdTest.getGasCostOfGetPrefix(id);
            console.log("Gas cost for extracting prefix for id with number 2^224 - 1 is " + gasCost.toString() + " gas");

        });
    });

});