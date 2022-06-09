const AddressResolver = artifacts.require('AddressResolver');
const ProxyController = artifacts.require('ProxyController');

const { should } = require('chai');
const { ethers } = require('hardhat');
const { toBytes32 } = require('../test-utils').strings;

should();

contract('CrossChainAddressResolver test', async (accounts) => {
  let crosschainAddressResolverProxy;
  const [owner] = accounts;

  before('deploy CrossChainAddressResolver', async () => {
    const addressResolver = await AddressResolver.new();
    const crosschainResolverFactory = await ethers.getContractFactory(
      'CrosschainAddressResolver',
    );
    const crosschainResolver = await crosschainResolverFactory.deploy();

    // Set up for Proxies
    const proxyController = await ProxyController.new(addressResolver.address);
    await proxyController.setCrosschainAddressResolverImpl(
      crosschainResolver.address,
    );
    crosschainAddressResolverProxy = await proxyController
      .getProxyAddress(toBytes32('CrosschainAddressResolver'))
      .then((address) =>
        ethers.getContractAt('CrosschainAddressResolver', address),
      );

    // Set up for AddressResolver
    await addressResolver.importAddresses(
      ['CollateralAggregator'].map((input) => toBytes32(input)),
      [owner],
    );
    await crosschainAddressResolverProxy.buildCache();
  });

  describe('Test cross chain address registration', () => {
    it('Test registering BTC address for user', async () => {
      let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';

      await crosschainAddressResolverProxy.functions[
        'updateAddress(uint256,string)'
      ](0, btcAddress);

      let address = await crosschainAddressResolverProxy.getUserAddress(
        owner,
        0,
      );
      address.should.be.equal(btcAddress);
    });

    it('Test registering FIL address for user', async () => {
      let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

      await crosschainAddressResolverProxy.functions[
        'updateAddress(uint256,string)'
      ](461, filAddress);

      let address = await crosschainAddressResolverProxy.getUserAddress(
        owner,
        461,
      );
      address.should.be.equal(filAddress);
    });

    it('Test registering FIL shortened miner address for user', async () => {
      let filMinerAddress = 'f01188117';

      await crosschainAddressResolverProxy.functions[
        'updateAddress(uint256,string)'
      ](461, filMinerAddress);

      let address = await crosschainAddressResolverProxy.getUserAddress(
        owner,
        461,
      );
      address.should.be.equal(filMinerAddress);
    });

    it('Test registering BTC segwit address for user', async () => {
      let btcSegwitAddress = 'bc1q2qlsskv7ewf4uz674qcsllaw060jf69ctcymtx';

      await crosschainAddressResolverProxy.functions[
        'updateAddress(uint256,string)'
      ](0, btcSegwitAddress);

      let address = await crosschainAddressResolverProxy.getUserAddress(
        owner,
        0,
      );
      address.should.be.equal(btcSegwitAddress);
    });

    it('Test registering BTC and FIL addresses for user', async () => {
      let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
      let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

      await crosschainAddressResolverProxy.updateAddresses(
        owner,
        [0, 461],
        [btcAddress, filAddress],
      );

      let address = await crosschainAddressResolverProxy.getUserAddress(
        owner,
        0,
      );
      address.should.be.equal(btcAddress);

      address = await crosschainAddressResolverProxy.getUserAddress(owner, 461);
      address.should.be.equal(filAddress);
    });
  });
});
