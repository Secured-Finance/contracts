import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract, ContractTransaction } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { hexETH, hexWBTC, toBytes32 } from '../../utils/strings';
import { btcToUSDRate, wBtcToBTCRate } from '../common/currencies';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const CurrencyController = artifacts.require('CurrencyController');
const GenesisValueVault = artifacts.require('GenesisValueVault');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');
const UpgradeabilityProxy = artifacts.require('UpgradeabilityProxy');

const { deployContract } = waffle;

const getUpdatedProxyAddress = async (tx: ContractTransaction) => {
  const { events } = await tx.wait();

  return events?.find(({ event }) => event === 'ProxyUpdated')?.args
    ?.proxyAddress;
};

describe('ProxyController', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let addressResolver: Contract;
  let proxyController: Contract;

  beforeEach('deploy ProxyController', async () => {
    [owner, alice] = await ethers.getSigners();
    proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    addressResolver = await deployContract(owner, AddressResolver)
      .then(({ address }) => proxyController.setAddressResolverImpl(address))
      .then(() => proxyController.getAddressResolverAddress())
      .then((address) => ethers.getContractAt('AddressResolver', address));
  });

  describe('Initialize', async () => {
    it('Deploy a ProxyController contract', async () => {
      const proxyController = await deployContract(owner, ProxyController, [
        addressResolver.address,
      ]);

      const addressResolverAddress =
        await proxyController.getAddressResolverAddress();
      expect(addressResolverAddress).to.equal(addressResolver.address);
    });
  });

  describe('Register contracts', async () => {
    it('Register a CurrencyController contract', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
      );
      const tx = await proxyController.setCurrencyControllerImpl(
        currencyController.address,
      );

      await expect(tx).to.emit(proxyController, 'ProxyUpdated');

      const currencyControllerProxyAddress = await getUpdatedProxyAddress(tx);

      expect(currencyControllerProxyAddress).not.to.equal(
        currencyController.address,
      );
    });

    it('Fail to set a contract due to invalid caller', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
      );

      await expect(
        proxyController
          .connect(alice)
          .setCurrencyControllerImpl(currencyController.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Update a CurrencyController contract', async () => {
      // register (fist time)
      const currencyController1 = await deployContract(
        owner,
        CurrencyController,
      );
      const currencyControllerProxyAddress1 = await proxyController
        .setCurrencyControllerImpl(currencyController1.address)
        .then(getUpdatedProxyAddress);

      await addressResolver.importAddresses(
        [toBytes32('CurrencyController')],
        [currencyControllerProxyAddress1],
      );

      // update (second time)
      const currencyController2 = await deployContract(
        owner,
        CurrencyController,
      );
      const tx = await proxyController.setCurrencyControllerImpl(
        currencyController2.address,
      );

      await expect(tx).to.emit(proxyController, 'ProxyUpdated');

      const currencyControllerProxyAddress2 = await getUpdatedProxyAddress(tx);

      expect(currencyControllerProxyAddress1).to.equal(
        currencyControllerProxyAddress2,
      );
    });

    it('Fail to set a contract due to invalid input', async () => {
      await expect(
        addressResolver.importAddresses(
          [toBytes32('Test1'), toBytes32('Test2')],
          [ethers.constants.AddressZero],
        ),
      ).revertedWith('UnmatchedInputs');
    });

    it('Register multiple contracts using multicall', async () => {
      const genesisValueVault = await deployContract(owner, GenesisValueVault);
      const beaconProxyController = await deployContract(
        owner,
        BeaconProxyController,
      );

      const inputs = [
        {
          function: 'setGenesisValueVaultImpl',
          args: [genesisValueVault.address],
        },
        {
          function: 'setBeaconProxyControllerImpl',
          args: [beaconProxyController.address],
        },
      ];

      const tx = await proxyController.multicall(
        inputs.map((input) =>
          proxyController.interface.encodeFunctionData(
            input.function,
            input.args,
          ),
        ),
      );

      const { events } = await tx.wait();
      const addresses = events?.filter(({ event }) => event === 'ProxyUpdated');

      expect(addresses?.length).to.equal(2);
    });

    it('Fail to register contracts due to execution by non-owner', async () => {
      await expect(
        proxyController
          .connect(alice)
          .setAddressResolverImpl(ethers.constants.AddressZero),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setBeaconProxyControllerImpl(ethers.constants.AddressZero),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setTokenVaultImpl(
            ethers.constants.AddressZero,
            1,
            1,
            1,
            ethers.constants.AddressZero,
          ),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setCurrencyControllerImpl(ethers.constants.AddressZero),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setGenesisValueVaultImpl(ethers.constants.AddressZero),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setLendingMarketControllerImpl(ethers.constants.AddressZero, 1),
      ).revertedWith('Ownable: caller is not the owner');

      await expect(
        proxyController
          .connect(alice)
          .setReserveFundImpl(
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
          ),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Get contract address', async () => {
    it('Successfully get a proxy address', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
      );
      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address)
        .then(getUpdatedProxyAddress);

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
      await expect(proxyController.getAddress(toBytes32('Test'))).revertedWith(
        'Address not found',
      );
    });

    it('Fail to call a contract due to missing address', async () => {
      const genesisValueVault = await deployContract(owner, GenesisValueVault);

      const genesisValueVaultProxyAddress = await proxyController
        .setGenesisValueVaultImpl(genesisValueVault.address)
        .then(getUpdatedProxyAddress);

      const genesisValueVaultProxy = await GenesisValueVault.at(
        genesisValueVaultProxyAddress,
      );
      await expect(
        genesisValueVaultProxy.updateInitialCompoundFactor(hexETH, '8000'),
      ).revertedWith('MissingAddress');
    });
  });

  describe('Use contracts through the Proxy', async () => {
    it('Successfully call a CurrencyController contract', async () => {
      const HAIRCUT = 7500;
      const HEARTBEAT = 3600;

      // register (fist time)
      const currencyController1 = await deployContract(
        owner,
        CurrencyController,
      );
      const currencyControllerProxyAddress1 = await proxyController
        .setCurrencyControllerImpl(currencyController1.address)
        .then(getUpdatedProxyAddress);
      const currencyControllerProxy1 = await CurrencyController.at(
        currencyControllerProxyAddress1,
      );

      await addressResolver.importAddresses(
        [toBytes32('CurrencyController')],
        [currencyControllerProxyAddress1],
      );

      // Set up for CurrencyController
      const btcToETHPriceFeed = await deployContract(owner, MockV3Aggregator, [
        18,
        hexWBTC,
        btcToUSDRate,
      ]);
      const wBtcToBTCPriceFeed = await deployContract(owner, MockV3Aggregator, [
        6,
        hexWBTC,
        wBtcToBTCRate,
      ]);
      await currencyControllerProxy1.addCurrency(
        hexWBTC,
        6,
        HAIRCUT,
        [wBtcToBTCPriceFeed.address, btcToETHPriceFeed.address],
        HEARTBEAT,
      );

      const haircut1 = await currencyControllerProxy1.getHaircut(hexWBTC);
      expect(haircut1.toString()).to.equal(HAIRCUT.toString());

      const revision = await currencyControllerProxy1.getRevision();
      expect(revision.toString()).to.equal('1');

      // update (second time)
      const currencyController2 = await deployContract(
        owner,
        CurrencyController,
      );
      const currencyControllerProxyAddress2 = await proxyController
        .setCurrencyControllerImpl(currencyController2.address)
        .then(getUpdatedProxyAddress);
      const currencyControllerProxy2 = await CurrencyController.at(
        currencyControllerProxyAddress2,
      );

      const haircut2 = await currencyControllerProxy2.getHaircut(hexWBTC);
      expect(haircut2.toString()).to.equal(HAIRCUT.toString());
    });

    it('Fail to call a CurrencyController contract due to direct access', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
      );

      await expect(currencyController.initialize(owner.address)).revertedWith(
        'Must be called from proxy contract',
      );
    });
  });

  describe('Change Admin', async () => {
    it('Successfully change admins of a proxy contract', async () => {
      const currencyController = await deployContract(
        owner,
        CurrencyController,
      );

      const currencyControllerProxyAddress = await proxyController
        .setCurrencyControllerImpl(currencyController.address)
        .then(getUpdatedProxyAddress);

      await addressResolver.importAddresses(
        ['CurrencyController'].map(toBytes32),
        [currencyControllerProxyAddress],
      );

      await proxyController.changeProxyAdmins(alice.address, [
        currencyControllerProxyAddress,
      ]);

      const currencyControllerProxy = await UpgradeabilityProxy.at(
        currencyControllerProxyAddress,
      );

      const currencyControllerAdmin = await currencyControllerProxy.admin();

      expect(currencyControllerAdmin).to.equal(alice.address);
    });

    it('Fail to change admins of a proxy contract due to execution by non-owner', async () => {
      await expect(
        proxyController
          .connect(alice)
          .changeProxyAdmins(alice.address, [ethers.constants.AddressZero]),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });
});
