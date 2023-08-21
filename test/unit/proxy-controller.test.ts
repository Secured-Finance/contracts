import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expectEvent, expectRevert } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { artifacts, ethers } from 'hardhat';
import { hexETH, hexWBTC, toBytes32 } from '../../utils/strings';
import { btcToETHRate, wBtcToBTCRate } from '../common/constants';

const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const GenesisValueVault = artifacts.require('GenesisValueVault');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');
const UpgradeabilityProxy = artifacts.require('UpgradeabilityProxy');

const getNewProxyAddress = ({ logs }) =>
  logs.find(({ event }) => event === 'ProxyCreated').args.proxyAddress;
const getUpdatedProxyAddress = ({ logs }) =>
  logs.find(({ event }) => event === 'ProxyUpdated').args.proxyAddress;

describe('ProxyController', () => {
  let ownerSinger: SignerWithAddress;
  let aliceSigner: SignerWithAddress;
  let addressResolver: Contract;
  let proxyController: Contract;

  beforeEach('deploy ProxyController', async () => {
    [ownerSinger, aliceSigner] = await ethers.getSigners();
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
        hexETH,
      );

      const currencyControllerProxyAddress = getNewProxyAddress(tx);

      expect(currencyControllerProxyAddress).not.to.equal(
        currencyController.address,
      );
      expectEvent(tx, 'ProxyCreated');
    });

    it('Fail to set a contract due to invalid caller', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      await expectRevert(
        proxyController.setCurrencyControllerImpl(
          currencyController.address,
          hexETH,
          {
            from: aliceSigner.address,
          },
        ),
        'Ownable: caller is not the owner',
      );
    });

    it('Successfully update a CurrencyController contract', async () => {
      // register (fist time)
      const currencyController1 = await CurrencyController.new(
        addressResolver.address,
      );
      const currencyControllerProxyAddress1 = await proxyController
        .setCurrencyControllerImpl(currencyController1.address, hexETH)
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
        hexETH,
      );
      const currencyControllerProxyAddress2 = getUpdatedProxyAddress(tx2);

      expect(currencyControllerProxyAddress1).to.equal(
        currencyControllerProxyAddress2,
      );
      expectEvent(tx2, 'ProxyUpdated');
    });

    it('Fail to set a contract due to invalid input', async () => {
      await expectRevert(
        addressResolver.importAddresses(
          [toBytes32('Test1'), toBytes32('Test2')],
          [ethers.constants.AddressZero],
        ),
        'UnmatchedInputs',
      );
    });
  });

  describe('Get contract address', async () => {
    it('Successfully get a proxy address', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );
      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address, hexETH)
        .then(getNewProxyAddress);

      const contractName = toBytes32('CurrencyController');
      await addressResolver.importAddresses(
        [contractName],
        [currencyControllerProxyAddress],
      );

      const registeredProxyAddress = await proxyController.getAddress(
        contractName,
      );
      expect(registeredProxyAddress).to.be.equal(
        currencyControllerProxyAddress,
      );
    });

    it('Fail to get a proxy address due to empty data', async () => {
      await expectRevert(
        proxyController.getAddress(toBytes32('Test')),
        'Address not found',
      );
    });

    it('Fail to call a contract due to missing address', async () => {
      const genesisValueVault = await GenesisValueVault.new(
        addressResolver.address,
      );

      const genesisValueVaultProxyAddress = await proxyController
        .setGenesisValueVaultImpl(genesisValueVault.address)
        .then(getNewProxyAddress);

      const genesisValueVaultProxy = await GenesisValueVault.at(
        genesisValueVaultProxyAddress,
      );
      await expectRevert(
        genesisValueVaultProxy.updateInitialCompoundFactor(hexETH, '8000'),
        'MissingAddress',
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
        .setCurrencyControllerImpl(currencyController1.address, hexETH)
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
        hexWBTC,
        btcToETHRate,
      );
      const wBtcToBTCPriceFeed = await MockV3Aggregator.new(
        6,
        hexWBTC,
        wBtcToBTCRate,
      );
      await currencyControllerProxy1.addCurrency(hexWBTC, 6, HAIRCUT, [
        wBtcToBTCPriceFeed.address,
        btcToETHPriceFeed.address,
      ]);

      const haircut1 = await currencyControllerProxy1.getHaircut(hexWBTC);
      expect(haircut1.toString()).to.equal(HAIRCUT.toString());

      // update (second time)
      const currencyController2 = await CurrencyController.new(
        currencyController1.address,
      );
      const currencyControllerProxyAddress2 = await proxyController
        .setCurrencyControllerImpl(currencyController2.address, hexETH)
        .then(getUpdatedProxyAddress);
      const currencyControllerProxy2 = await CurrencyController.at(
        currencyControllerProxyAddress2,
      );

      const haircut2 = await currencyControllerProxy2.getHaircut(hexWBTC);
      expect(haircut2.toString()).to.equal(HAIRCUT.toString());
    });

    it('Fail to call a CurrencyController contract due to direct access', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      await expectRevert(
        currencyController.initialize(ownerSinger.address, hexETH),
        'Must be called from proxy contract',
      );
    });
  });

  describe('Change Admin', async () => {
    it('Successfully change admins of a proxy contract', async () => {
      const currencyController = await CurrencyController.new(
        addressResolver.address,
      );

      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address, hexETH)
        .then(getNewProxyAddress);

      await addressResolver.importAddresses(
        ['CurrencyController'].map(toBytes32),
        [currencyControllerProxyAddress],
      );

      await proxyController.changeProxyAdmins(aliceSigner.address, [
        currencyControllerProxyAddress,
      ]);

      const currencyControllerProxy = await UpgradeabilityProxy.at(
        currencyControllerProxyAddress,
      );

      const currencyControllerAdmin = await currencyControllerProxy.admin();

      expect(currencyControllerAdmin).to.equal(aliceSigner.address);
    });
  });
});
