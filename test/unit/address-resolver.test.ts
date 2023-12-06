import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const ProxyController = artifacts.require('ProxyController');
const TokenVault = artifacts.require('TokenVault');

const { deployContract, deployMockContract } = waffle;

describe('AddressResolver', () => {
  let mockContract1: MockContract;
  let mockContract2: MockContract;
  let addressResolverProxy: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  const contractName1 = ethers.utils.formatBytes32String('TokenVault1');
  const contractName2 = ethers.utils.formatBytes32String('TokenVault2');

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    mockContract1 = await deployMockContract(owner, TokenVault.abi);
    mockContract2 = await deployMockContract(owner, TokenVault.abi);
  });

  beforeEach(async () => {
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    // Get the Proxy contracts
    addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
  });

  describe('Ownership', async () => {
    it('Transfer ownership', async () => {
      await addressResolverProxy.transferOwnership(alice.address);
      expect(await addressResolverProxy.owner()).to.equal(alice.address);
    });

    it('Renounce ownership', async () => {
      await addressResolverProxy.renounceOwnership();
      expect(await addressResolverProxy.owner()).to.equal(
        ethers.constants.AddressZero,
      );
    });

    it('Fail to renounce ownership due to execution by non-owner', async () => {
      await expect(
        addressResolverProxy.connect(alice).renounceOwnership(),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to transfer ownership due execution by non-owner', async () => {
      await expect(
        addressResolverProxy
          .connect(alice)
          .transferOwnership(ethers.constants.AddressZero),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to transfer ownership due to zero address', async () => {
      await expect(
        addressResolverProxy.transferOwnership(ethers.constants.AddressZero),
      ).revertedWith('Ownable: new owner is the zero address');
    });
  });

  describe('Initialization', async () => {
    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(addressResolverProxy.initialize(owner.address)).revertedWith(
        'Initializable: contract is already initialized',
      );
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const addressResolver = await deployContract(owner, AddressResolver);

      await expect(addressResolver.initialize(owner.address)).revertedWith(
        'Must be called from proxy contract',
      );
    });
  });

  describe('Address importing', async () => {
    it('Import empty array', async () => {
      await expect(addressResolverProxy.importAddresses([], [])).not.emit(
        addressResolverProxy,
        'AddressImported',
      );

      const areAddressesImported1 =
        await addressResolverProxy.areAddressesImported([], []);

      expect(areAddressesImported1).to.true;
    });

    it('Import an address', async () => {
      await expect(
        addressResolverProxy.importAddresses(
          [contractName1],
          [mockContract1.address],
        ),
      ).emit(addressResolverProxy, 'AddressImported');

      const areAddressesImported1 =
        await addressResolverProxy.areAddressesImported(
          [contractName1],
          [mockContract1.address],
        );

      expect(areAddressesImported1).to.true;

      const areAddressesImported2 =
        await addressResolverProxy.areAddressesImported(
          [contractName1],
          [mockContract2.address],
        );

      expect(areAddressesImported2).to.false;
    });

    it('Import multiple addresses', async () => {
      await expect(
        addressResolverProxy.importAddresses(
          [contractName1, contractName2],
          [mockContract1.address, mockContract2.address],
        ),
      ).emit(addressResolverProxy, 'AddressImported');

      const areAddressesImported =
        await addressResolverProxy.areAddressesImported(
          [contractName1, contractName2],
          [mockContract1.address, mockContract2.address],
        );

      expect(areAddressesImported).to.true;
    });

    it('Import an addresses multiple times with different contract', async () => {
      await expect(
        addressResolverProxy.importAddresses(
          [contractName1],
          [mockContract1.address],
        ),
      ).emit(addressResolverProxy, 'AddressImported');

      expect(
        await addressResolverProxy['getAddress(bytes32)'](contractName1),
      ).to.equal(mockContract1.address);
      expect(
        await addressResolverProxy['getAddress(bytes32)'](contractName2),
      ).to.equal(ethers.constants.AddressZero);

      await expect(
        addressResolverProxy.importAddresses(
          [contractName2],
          [mockContract2.address],
        ),
      ).emit(addressResolverProxy, 'AddressImported');

      expect(
        await addressResolverProxy['getAddress(bytes32)'](contractName1),
      ).to.equal(ethers.constants.AddressZero);
      expect(
        await addressResolverProxy['getAddress(bytes32)'](contractName2),
      ).to.equal(mockContract2.address);
    });

    it('Fail to import an addresses due to unmatched inputs', async () => {
      await expect(
        addressResolverProxy.importAddresses(
          [contractName1],
          [mockContract1.address, mockContract1.address],
        ),
      ).revertedWith('UnmatchedInputs');
    });

    it('Fail to import an addresses due to execution by non-owner', async () => {
      await expect(
        addressResolverProxy
          .connect(alice)
          .importAddresses([contractName1], [mockContract1.address]),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Imported address check', async () => {
    it('Get an empty address', async () => {
      const address = await addressResolverProxy['getAddress(bytes32)'](
        contractName1,
      );
      const addresses = await addressResolverProxy.getAddresses();
      const names = await addressResolverProxy.getNames();

      expect(address).to.equal(ethers.constants.AddressZero);
      expect(addresses.length).to.equal(0);
      expect(names.length).to.equal(0);
    });

    it('Get a imported address', async () => {
      await addressResolverProxy.importAddresses(
        [contractName1],
        [mockContract1.address],
      );

      const address1 = await addressResolverProxy['getAddress(bytes32)'](
        contractName1,
      );
      const address2 = await addressResolverProxy['getAddress(bytes32,string)'](
        contractName1,
        'error',
      );

      expect(address1).to.equal(mockContract1.address);
      expect(address1).to.equal(address2);
    });

    it('Get multiple imported addresses', async () => {
      await addressResolverProxy.importAddresses(
        [contractName1, contractName2],
        [mockContract1.address, mockContract2.address],
      );

      const addresses = await addressResolverProxy.getAddresses();
      const names = await addressResolverProxy.getNames();

      expect(addresses.length).to.equal(2);
      expect(addresses[0]).to.equal(mockContract1.address);
      expect(addresses[1]).to.equal(mockContract2.address);
      expect(names.length).to.equal(2);
      expect(names[0]).to.equal(contractName1);
      expect(names[1]).to.equal(contractName2);
    });

    it('Fail to get a imported address due to non-exist contract', async () => {
      await expect(
        addressResolverProxy['getAddress(bytes32,string)'](
          contractName1,
          'error',
        ),
      ).revertedWith('error');
    });
  });
});
