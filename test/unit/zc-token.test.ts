import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract, deployMockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { getPermitSignature } from '../common/signers';
// import { ZCToken } from '../../typechain';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const ZCTokenCaller = artifacts.require('ZCTokenCaller');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const MockERC20 = artifacts.require('MockERC20');
const ProxyController = artifacts.require('ProxyController');

const { deployContract } = waffle;

describe('ZCToken', () => {
  let zcTokenCaller: Contract;
  let zcTokenProxy: Contract;

  let mockERC20: MockContract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const name = 'Zero Coupon Token';
  const symbol = 'ZCT';
  const decimals = 24;
  const maturity = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

  before(async () => {
    [owner, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async () => {
    // Deploy mocks
    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const beaconProxyController = await deployContract(
      owner,
      BeaconProxyController,
    );

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const beaconProxyControllerAddress = await proxyController
      .setBeaconProxyControllerImpl(beaconProxyController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    const beaconProxyControllerProxy = await ethers.getContractAt(
      'BeaconProxyController',
      beaconProxyControllerAddress,
    );

    // Deploy LendingMarketCaller
    zcTokenCaller = await deployContract(owner, ZCTokenCaller, [
      beaconProxyControllerProxy.address,
    ]);

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['BeaconProxyController', beaconProxyControllerProxy],
      ['LendingMarketController', zcTokenCaller],
    ];

    const importAddressesArgs = {
      names: migrationTargets.map(([name]) =>
        ethers.utils.formatBytes32String(name),
      ),
      addresses: migrationTargets.map(([, contract]) => contract.address),
    };

    await addressResolverProxy.importAddresses(
      importAddressesArgs.names,
      importAddressesArgs.addresses,
    );
    await migrationAddressResolver.buildCaches([
      beaconProxyControllerProxy.address,
    ]);

    // Set up for FutureValueVault
    const zcToken = await ethers
      .getContractFactory('ZCToken')
      .then((factory) => factory.deploy());

    await beaconProxyControllerProxy.setZCTokenImpl(zcToken.address);

    await zcTokenCaller.deployZCToken(
      name,
      symbol,
      decimals,
      mockERC20.address,
      maturity,
    );

    zcTokenProxy = await zcTokenCaller
      .zcToken()
      .then((address) => ethers.getContractAt('ZCToken', address));
  });

  describe('Initialization', () => {
    it('Get correct name, symbol, asset, and maturity', async () => {
      expect(await zcTokenProxy.name()).to.equal(name);
      expect(await zcTokenProxy.symbol()).to.equal(symbol);
      expect(await zcTokenProxy.decimals()).to.equal(decimals);
      expect(await zcTokenProxy.asset()).to.equal(mockERC20.address);
      expect(await zcTokenProxy.maturity()).to.equal(maturity);
    });
  });

  describe('Minting and Burning', () => {
    const amount = ethers.utils.parseEther('1000');

    it('Mint tokens successfully', async () => {
      await expect(zcTokenCaller.connect(owner).mint(alice.address, amount))
        .to.emit(zcTokenProxy, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, amount);

      expect(await zcTokenProxy.balanceOf(alice.address)).to.equal(amount);
    });

    it('Burn tokens successfully', async () => {
      await zcTokenCaller.connect(owner).mint(alice.address, amount);

      await expect(zcTokenCaller.connect(owner).burn(alice.address, amount))
        .to.emit(zcTokenProxy, 'Transfer')
        .withArgs(alice.address, ethers.constants.AddressZero, amount);

      expect(await zcTokenProxy.balanceOf(alice.address)).to.equal(0);
    });

    it('Fail to mint tokens by non-authorized addresses', async () => {
      await expect(
        zcTokenProxy.connect(bob).mint(alice.address, amount),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to burn tokens by non-authorized addresses', async () => {
      await expect(
        zcTokenProxy.connect(bob).burn(alice.address, amount),
      ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });

  describe('Permit', () => {
    const value = BigNumber.from(42);
    const maxDeadline = ethers.constants.MaxUint256;
    let chainId: number;

    before(async () => {
      ({ chainId } = await ethers.provider.getNetwork());
    });

    it('Get domain separator', async function () {
      expect(await zcTokenProxy.DOMAIN_SEPARATOR()).to.equal(
        ethers.utils._TypedDataEncoder.hashDomain({
          name: await zcTokenProxy.name(),
          version: '1',
          chainId,
          verifyingContract: zcTokenProxy.address,
        }),
      );
    });

    it('Accept owner signature', async function () {
      const { v, r, s } = await getPermitSignature(
        chainId,
        zcTokenProxy,
        alice,
        zcTokenCaller,
        value,
        maxDeadline,
      );

      await zcTokenProxy.permit(
        alice.address,
        zcTokenCaller.address,
        value,
        maxDeadline,
        v,
        r,
        s,
      );

      expect(await zcTokenProxy.nonces(alice.address)).to.equal(1);
      expect(
        await zcTokenProxy.allowance(alice.address, zcTokenCaller.address),
      ).to.equal(value);
    });

    it('Reject reused signature', async function () {
      const { v, r, s } = await getPermitSignature(
        chainId,
        zcTokenProxy,
        alice,
        zcTokenCaller,
        value,
        maxDeadline,
      );

      await zcTokenProxy.permit(
        alice.address,
        zcTokenCaller.address,
        value,
        maxDeadline,
        v,
        r,
        s,
      );

      await expect(
        zcTokenProxy.permit(
          alice.address,
          zcTokenCaller.address,
          value,
          maxDeadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith('ERC20Permit: invalid signature');
    });

    it('Reject other signature', async function () {
      const { v, r, s } = await getPermitSignature(
        chainId,
        zcTokenProxy,
        alice,
        zcTokenCaller,
        value,
        maxDeadline,
      );

      await expect(
        zcTokenProxy.permit(
          bob.address,
          zcTokenCaller.address,
          value,
          maxDeadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith('ERC20Permit: invalid signature');
    });

    it('Reject other signature', async function () {
      const deadline =
        (await ethers.provider.getBlock('latest')).timestamp - 86400; // 1 day ago

      const { v, r, s } = await getPermitSignature(
        chainId,
        zcTokenProxy,
        alice,
        zcTokenCaller,
        value,
        deadline,
      );

      await expect(
        zcTokenProxy.permit(
          alice.address,
          zcTokenCaller.address,
          value,
          deadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith('ERC20Permit: expired deadline');
    });
  });
});
