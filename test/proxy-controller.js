const { should } = require('chai');
const { toBytes32, hexBTCString, zeroAddress } =
  require('../test-utils').strings;
const { btcToETHRate } = require('../test-utils').numbers;

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

should();

const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');
const UpgradeabilityProxy = artifacts.require('UpgradeabilityProxy');

const getNewProxyAddress = ({ logs }) =>
  logs.find(({ event }) => event === 'ProxyCreated').args.proxyAddress;
const getUpdatedProxyAddress = ({ logs }) =>
  logs.find(({ event }) => event === 'ProxyUpdated').args.proxyAddress;

contract('ProxyController', (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let addressResolver;
  let proxyController;

  beforeEach('deploy ProxyController', async () => {
    proxyController = await ProxyController.new(ethers.constants.AddressZero);
    addressResolver = await AddressResolver.new()
      .then(({ address }) => proxyController.setAddressResolverImpl(address))
      .then(() => proxyController.getAddressResolverAddress())
      .then((address) => AddressResolver.at(address));
  });

  describe('Register contracts', async () => {
    it('Successfully register a CurrencyController contract', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );
      const tx = await proxyController.setCurrencyControllerImpl(
        currencyController.address,
      );

      const currencyControllerProxyAddress = getNewProxyAddress(tx);

      currencyControllerProxyAddress
        .toString()
        .should.be.not.equal(currencyController.address);
      expectEvent(tx, 'ProxyCreated');
    });

    it('Fail to set a contract due to invalid caller', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      expectRevert(
        proxyController.setCurrencyControllerImpl(currencyController.address, {
          from: alice,
        }),
        'Ownable: caller is not the owner',
      );
    });

    it('Successfully update a CurrencyController contract', async () => {
      // register (fist time)
      const currencyController1 = await CurrencyController.new(
        addressResolver.address,
      );
      const currencyControllerProxyAddress1 = await proxyController
        .setCurrencyControllerImpl(currencyController1.address)
        .then(getNewProxyAddress);

      await addressResolver.importAddresses(
        [toBytes32('CurrencyController')],
        [currencyControllerProxyAddress1],
      );

      // update (second time)
      const currencyController2 = await CurrencyController.new(
        currencyController1.address,
      );
      const tx2 = await proxyController.setCurrencyControllerImpl(
        currencyController2.address,
      );
      const currencyControllerProxyAddress2 = getUpdatedProxyAddress(tx2);

      currencyControllerProxyAddress1
        .toString()
        .should.be.equal(currencyControllerProxyAddress2);
      expectEvent(tx2, 'ProxyUpdated');
    });
  });

  describe('Get contract address', async () => {
    it('Successfully get a proxy address', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );
      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address)
        .then(getNewProxyAddress);

      const contractName = toBytes32('CurrencyController');
      await addressResolver.importAddresses(
        [contractName],
        [currencyControllerProxyAddress],
      );

      const registeredProxyAddress = await proxyController.getAddress(
        contractName,
      );
      registeredProxyAddress.should.be.equal(currencyControllerProxyAddress);
    });

    it('Fail to get a proxy address due to empty data', async () => {
      expectRevert(
        proxyController.getAddress(toBytes32('Test')),
        'Address not found',
      );
    });

    it('Fail to get a proxy address due to non-proxy contract', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      const contractName = toBytes32('CurrencyController');
      await addressResolver.importAddresses(
        [contractName],
        [currencyController.address],
      );

      expectRevert(
        proxyController.getAddress(toBytes32('Test')),
        'Proxy address not found',
      );
    });
  });

  describe('Use contracts through the Proxy', async () => {
    it('Successfully call a CurrencyController contract', async () => {
      const HAIRCUT = 7500;

      // register (fist time)
      const currencyController1 = await CurrencyController.new(
        addressResolver.address,
      );
      const currencyControllerProxyAddress1 = await proxyController
        .setCurrencyControllerImpl(currencyController1.address)
        .then(getNewProxyAddress);
      const currencyControllerProxy1 = await CurrencyController.at(
        currencyControllerProxyAddress1,
      );

      await addressResolver.importAddresses(
        [toBytes32('CurrencyController')],
        [currencyControllerProxyAddress1],
      );

      // Set up for CurrencyController
      const btcToETHPriceFeed = await MockV3Aggregator.new(
        18,
        hexBTCString,
        btcToETHRate,
      );
      await currencyControllerProxy1.supportCurrency(
        hexBTCString,
        'Bitcoin',
        0,
        btcToETHPriceFeed.address,
        HAIRCUT,
        zeroAddress,
      );

      const haircut1 = await currencyControllerProxy1.getHaircut(hexBTCString);
      haircut1.toString().should.be.equal(HAIRCUT.toString());

      // update (second time)
      const currencyController2 = await CurrencyController.new(
        currencyController1.address,
      );
      const currencyControllerProxyAddress2 = await proxyController
        .setCurrencyControllerImpl(currencyController2.address)
        .then(getUpdatedProxyAddress);
      const currencyControllerProxy2 = await CurrencyController.at(
        currencyControllerProxyAddress2,
      );

      const haircut2 = await currencyControllerProxy2.getHaircut(hexBTCString);
      haircut2.toString().should.be.equal(HAIRCUT.toString());
    });

    it('Fail to call a CurrencyController contract due to direct access', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      expectRevert(
        currencyController.initialize(owner),
        'Must be called from UpgradeabilityProxy',
      );
    });
  });

  describe('Change Admin', async () => {
    it('Successfully change admins of a proxy contract', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address)
        .then(getNewProxyAddress);

      await addressResolver.importAddresses(
        ['CurrencyController'].map(toBytes32),
        [currencyControllerProxyAddress],
      );

      await proxyController.changeProxyAdmins(alice, [
        currencyControllerProxyAddress,
      ]);

      const currencyControllerProxy = await UpgradeabilityProxy.at(
        currencyControllerProxyAddress,
      );

      const currencyControllerAdmin = await currencyControllerProxy.admin();

      currencyControllerAdmin.toString().should.be.equal(alice);
    });
  });
});
