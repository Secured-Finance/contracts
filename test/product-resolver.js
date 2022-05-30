const BytesConversion = artifacts.require('BytesConversion');

const { should } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { zeroAddress, loanPrefix, loanName } = require('../test-utils').strings;
const { PrintTable } = require('../test-utils').helper;
const { Deployment } = require('../test-utils').deployment;
const { ethers } = require('hardhat');
const utils = require('web3-utils');

should();

contract('ProductAddressResolver contract test', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let bytesConversion;
  let productAddressResolver;

  let loan;
  let lendingMarketController;

  const generatePrefix = (val) => {
    let encodedPosition = ethers.utils.defaultAbiCoder.encode(
      ['string'],
      [val],
    );

    let hash = ethers.utils.keccak256(encodedPosition);
    return hash.slice(0, 10);
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

    const deployment = new Deployment();
    deployment
      .mock('ProductAddressResolver')
      .useFactory('ProductAddressResolverTest', (instances) => ({
        DealId: instances.dealIdLibrary.address,
      }))
      .deploy();

    ({ lendingMarketController, loan, productAddressResolver } =
      await deployment.execute());
  });

  describe('Test register product function', async () => {
    it('Successfully add loan product type and check contract addresses', async () => {
      let prefix = generatePrefix(loanName);
      prefix.should.be.equal(loanPrefix);

      let productPrefix = await bytesConversion.getBytes4(loanName);
      prefix.should.be.equal(productPrefix);

      await productAddressResolver.registerProduct(
        productPrefix,
        loan.address,
        lendingMarketController.address,
        { from: owner },
      );

      let id = generateId(12, productPrefix);
      let parsedId = id.slice(0, 10);

      let contract = await productAddressResolver.getProductContract(parsedId);
      contract.should.be.equal(loan.address);

      contract = await productAddressResolver.getControllerContract(parsedId);
      contract.should.be.equal(lendingMarketController.address);
    });

    it('Try to add swap product type by Alice, expect revert', async () => {
      const productName = '0xSwap';
      let prefix = generatePrefix(productName);

      let productPrefix = await bytesConversion.getBytes4(productName);
      prefix.should.be.equal(productPrefix);

      expectRevert(
        productAddressResolver
          .connect(signers[1])
          .registerProduct(
            productPrefix,
            loan.address,
            lendingMarketController.address,
            { from: alice },
          ),
        'INVALID_ACCESS',
      );

      let id = generateId(12412, productPrefix);
      let parsedId = id.slice(0, 10);

      let product = await productAddressResolver.getProductContract(parsedId);
      product.should.be.equal(zeroAddress);

      let controller = await productAddressResolver.getControllerContract(
        parsedId,
      );
      controller.should.be.equal(zeroAddress);
    });

    it('Expect revert on adding non-contract addresses', async () => {
      const productName = '0xSwapWithNotionalExchange';
      let prefix = generatePrefix(productName);

      expectRevert(
        productAddressResolver
          .connect(signers[0])
          .registerProduct(prefix, alice, lendingMarketController.address),
        "Can't add non-contract address",
      );

      expectRevert(
        productAddressResolver.registerProduct(prefix, loan.address, bob),
        "Can't add non-contract address",
      );
    });

    it('Successfully add swap product type', async () => {
      const productName = '0xSwapWithoutNotionalExchange';
      let prefix = generatePrefix(productName);

      let productPrefix = await bytesConversion.getBytes4(productName);
      prefix.should.be.equal(productPrefix);

      await productAddressResolver.registerProduct(
        productPrefix,
        loan.address,
        lendingMarketController.address,
      );

      let id = generateId(6753, productPrefix);
      let parsedId = id.slice(0, 10);

      let contract = await productAddressResolver.getProductContract(parsedId);
      contract.should.be.equal(loan.address);

      contract = await productAddressResolver.getControllerContract(parsedId);
      contract.should.be.equal(lendingMarketController.address);
    });

    it('Successfully replace old loan product contract', async () => {
      const newLoanDummy = lendingMarketController.address;
      let prefix = generatePrefix(loanName);

      let productPrefix = await bytesConversion.getBytes4(loanName);
      prefix.should.be.equal(productPrefix);

      await productAddressResolver.registerProduct(
        productPrefix,
        loan.address,
        lendingMarketController.address,
      );

      const isRegistered =
        await productAddressResolver.isRegisteredProductContract(loan.address);
      isRegistered.should.be.equal(true);

      await productAddressResolver.registerProduct(
        productPrefix,
        newLoanDummy,
        lendingMarketController.address,
      );

      const isRegisteredOld =
        await productAddressResolver.isRegisteredProductContract(loan.address);
      const isRegisteredNew =
        await productAddressResolver.isRegisteredProductContract(newLoanDummy);
      isRegisteredOld.should.be.equal(false);
      isRegisteredNew.should.be.equal(true);
    });
  });

  describe('Test register multiple products function', async () => {
    it('Successfully try to add multiple products', async () => {
      const swapName = '0xSwapWithoutNotionalExchange';
      let swapPrefix = generatePrefix(swapName);

      let prefixes = [loanPrefix, swapPrefix];
      let productAddreesses = [loan.address, loan.address];
      let controllers = [
        lendingMarketController.address,
        lendingMarketController.address,
      ];

      await productAddressResolver.registerProducts(
        prefixes,
        productAddreesses,
        controllers,
        { from: owner },
      );
    });

    it('Expect revert on adding products with different number of variables', async () => {
      const swapName = '0xInterestRateSwap';
      let swapPrefix = generatePrefix(swapName);

      let prefixes = [loanPrefix, swapPrefix];
      let productAddreesses = [loan.address];
      let controllers = [lendingMarketController.address];

      expectRevert(
        productAddressResolver.registerProducts(
          prefixes,
          productAddreesses,
          controllers,
          { from: owner },
        ),
        'Invalid input lengths',
      );

      expectRevert(
        productAddressResolver
          .connect(signers[2])
          .registerProducts(
            prefixes,
            [loan.address, loan.address],
            [lendingMarketController.address, lendingMarketController.address],
          ),
        'INVALID_ACCESS',
      );
    });
  });

  describe('Calculate gas costs', async () => {
    it('Gas costs for getting contract addresses', async () => {
      const gasCostTable = new PrintTable('GasCost');
      let id = generateId(6753, loanPrefix);
      let parsedId = id.slice(0, 10);

      await gasCostTable.add(
        'Get product contract',
        productAddressResolver.getGasCostOfGetProductContract(parsedId),
      );

      await gasCostTable.add(
        'Get controller contract',
        productAddressResolver.getGasCostOfGetControllerContract(parsedId),
      );

      gasCostTable.log();
    });

    it('Gas costs for getting contract addresses with dealID conversion', async () => {
      const gasCostTable = new PrintTable('GasCost');
      let id = generateId(1337, loanPrefix);

      await gasCostTable.add(
        'Get product contract',
        productAddressResolver.getGasCostOfGetProductContractWithTypeConversion(
          id,
        ),
      );

      await gasCostTable.add(
        'Get controller contract',
        productAddressResolver.getGasCostOfGetControllerContractWithTypeConversion(
          id,
        ),
      );
      gasCostTable.log();
    });
  });
});
