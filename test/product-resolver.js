const ProductAddressResolverTest = artifacts.require("ProductAddressResolverTest");
const BytesConversion = artifacts.require('BytesConversion');
const LendingMarketControllerMock = artifacts.require('LendingMarketControllerMock');

const { should } = require('chai');
const { zeroAddress, loanPrefix, loanName } = require('../test-utils').strings;
const { ethers } = require('hardhat');
const utils = require('web3-utils');
const { emitted, reverted, equal } = require('../test-utils').assert;

should();

contract('ProductAddressResolver contract test', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let bytesConversion;
    let productResolver;
    
    let loan;
    let lendingController;

    const generatePrefix = (val) => {
        let encodedPosition = ethers.utils.defaultAbiCoder.encode([ "string" ], [ val ]);

        let hash = ethers.utils.keccak256(encodedPosition);
        return hash.slice(0,10);
    };

    const generateId = (value, prefix) => {
        let right = utils.toBN(utils.rightPad(prefix, 64));
        let left = utils.toBN(utils.leftPad(value, 64));
    
        let id = utils.numberToHex(right.or(left));

        return id;
    };

    before('deploy Product Address Resolver contract', async () => {
        bytesConversion = await BytesConversion.new();

        signers = await ethers.getSigners();

        const DealId = await ethers.getContractFactory('DealId')
        const dealIdLibrary = await DealId.deploy();
        await dealIdLibrary.deployed();

        const productResolverFactory = await ethers.getContractFactory(
            'ProductAddressResolverTest',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
        productResolver = await productResolverFactory.deploy();


        const loanFactory = await ethers.getContractFactory(
            'LoanV2',
            {
                libraries: {
                    DealId: dealIdLibrary.address
                }
              }
            )
        loan = await loanFactory.deploy();

        lendingController = await LendingMarketControllerMock.new();
    });

    describe("Test register product function", async () => {
        it("Succesfully add loan product type and check contract addresses", async () => {
            let prefix = generatePrefix(loanName);
            prefix.should.be.equal(loanPrefix);

            let productPrefix = await bytesConversion.getBytes4(loanName);
            prefix.should.be.equal(productPrefix);

            await productResolver.registerProduct(productPrefix, loan.address, lendingController.address, {from: owner});

            let id = generateId(12, productPrefix);
            let parsedId = id.slice(0,10);

            let contract = await productResolver.getProductContract(parsedId);
            contract.should.be.equal(loan.address);

            contract = await productResolver.getControllerContract(parsedId);
            contract.should.be.equal(lendingController.address);
        });

        it("Try to add swap product type by Alice, expect revert", async () => {
            const productName = "0xSwap";
            let prefix = generatePrefix(productName);

            let productPrefix = await bytesConversion.getBytes4(productName);
            prefix.should.be.equal(productPrefix);

            await reverted(
                productResolver.connect(signers[1]).registerProduct(productPrefix, loan.address, lendingController.address, {from: alice}),
                "INVALID_ACCESS"
            );

            let id = generateId(12412, productPrefix);
            let parsedId = id.slice(0,10);

            let product = await productResolver.getProductContract(parsedId);
            product.should.be.equal(zeroAddress);

            let controller = await productResolver.getControllerContract(parsedId);
            controller.should.be.equal(zeroAddress);
        });

        it("Expect revert on adding non-contract addresses", async () => {
            const productName = "0xSwapWithNotionalExchange";
            let prefix = generatePrefix(productName);

            await reverted(
                productResolver.connect(signers[0]).registerProduct(prefix, alice, lendingController.address), 
                "Can't add non-contract address"
            );

            await reverted(
                productResolver.registerProduct(prefix, loan.address, bob), 
                "Can't add non-contract address"
            );
        });

        it("Succesfully add swap product type", async () => {
            const productName = "0xSwapWithoutNotionalExchange";
            let prefix = generatePrefix(productName);

            let productPrefix = await bytesConversion.getBytes4(productName);
            prefix.should.be.equal(productPrefix);

            await productResolver.registerProduct(productPrefix, loan.address, lendingController.address);

            let id = generateId(6753, productPrefix);
            let parsedId = id.slice(0,10);

            let contract = await productResolver.getProductContract(parsedId);
            contract.should.be.equal(loan.address);

            contract = await productResolver.getControllerContract(parsedId);
            contract.should.be.equal(lendingController.address);
        });
    });

    describe("Test register multiple products function", async () => {
        it("Succesfully try to add multiple products", async () => {
            const swapName = "0xSwapWithoutNotionalExchange";
            let swapPrefix = generatePrefix(swapName);

            let prefixes = [loanPrefix, swapPrefix];
            let productAddreesses = [loan.address, loan.address];
            let controllers = [lendingController.address, lendingController.address];

            await productResolver.registerProducts(prefixes, productAddreesses, controllers, {from: owner});
        });

        it("Expect revert on adding products with different number of variables", async () => {
            const swapName = "0xInterestRateSwap";
            let swapPrefix = generatePrefix(swapName);

            let prefixes = [loanPrefix, swapPrefix];
            let productAddreesses = [loan.address];
            let controllers = [lendingController.address];

            await reverted(
                productResolver.registerProducts(prefixes, productAddreesses, controllers, {from: owner}), 
                "Invalid input lengths"
            );

            await reverted(
                productResolver.connect(signers[2]).registerProducts(prefixes, [loan.address, loan.address], [lendingController.address, lendingController.address]),
                "INVALID_ACCESS"
            );
        });    
    });

    describe("Calculate gas costs", async () => {
        it('Gas costs for getting contract addresses', async () => {
            let id = generateId(6753, loanPrefix);
            let parsedId = id.slice(0,10);

            let gasCost = await productResolver.getGasCostOfGetProductContract(parsedId);
            console.log("Gas cost for getting product contract is " + gasCost.toString() + " gas");

            gasCost = await productResolver.getGasCostOfGetControllerContract(parsedId);
            console.log("Gas cost for getting controller contract is " + gasCost.toString() + " gas");
        });

        it('Gas costs for getting contract addresses with dealID conversion', async () => {
            let id = generateId(1337, loanPrefix);

            let gasCost = await productResolver.getGasCostOfGetProductContractWithTypeConversion(id);
            console.log("Gas cost for getting product contract is " + gasCost.toString() + " gas");

            gasCost = await productResolver.getGasCostOfGetControllerContractWithTypeConversion(id);
            console.log("Gas cost for getting controller contract is " + gasCost.toString() + " gas");
        });

    });
});