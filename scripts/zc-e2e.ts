import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract, Wallet } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { hexETHString, hexFILString, toBytes32 } from '../utils/strings';

describe('ZC e2e test', async () => {
  const targetCurrency = hexFILString;
  const BP = 0.01;
  const depositAmountInETH = '10000000000000000000';
  const orderAmountInFIL = '50000000000000000000';
  const orderRate = String(3 / BP);

  // Accounts
  let ownerSigner: SignerWithAddress | Wallet;
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;

  // Contracts
  let proxyController: Contract;
  let collateralAggregator: Contract;
  let collateralVault: Contract;
  let lendingMarketController: Contract;

  before('Set up for testing', async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const network = await ethers.provider.getNetwork();

    console.log('Block number is', blockNumber);
    console.log('Chain id is', network.chainId);

    if (process.env.FORK_RPC_ENDPOINT && process.env.PRIVATE_KEY) {
      ethers.provider = new ethers.providers.JsonRpcProvider(
        process.env.FORK_RPC_ENDPOINT,
      );

      [aliceSigner, bobSigner, carolSigner] = await ethers.getSigners();
      ownerSigner = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
    } else {
      [ownerSigner, aliceSigner, bobSigner, carolSigner] =
        await ethers.getSigners();
    }

    console.table(
      {
        owner: ownerSigner,
        alice: aliceSigner,
        bob: bobSigner,
        carol: carolSigner,
      },
      ['address'],
    );

    // Get ETH
    if (process.env.FORK_RPC_ENDPOINT) {
      const params = [[ownerSigner.address], ethers.utils.hexValue(10)];
      await ethers.provider.send('tenderly_addBalance', params);
    }

    const getProxy = (key: string) =>
      proxyController
        .getAddress(toBytes32(key))
        .then((address) => ethers.getContractAt(key, address));

    // Get contracts
    proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    // Get proxy contracts
    collateralAggregator = await getProxy('CollateralAggregator');
    collateralVault = await getProxy('CollateralVault');
    lendingMarketController = await getProxy('LendingMarketController');

    console.table(
      {
        proxyController,
        collateralAggregator,
        collateralVault,
        lendingMarketController,
      },
      ['address'],
    );
  });

  it('Deposit ETH', async () => {
    // Deposit ETH by Alice
    const isRegisteredAlice = await collateralAggregator.isRegisteredUser(
      aliceSigner.address,
    );

    if (!isRegisteredAlice) {
      await collateralAggregator
        .connect(aliceSigner)
        .register()
        .then((tx) => tx.wait());

      await collateralVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmountInETH, {
          value: depositAmountInETH,
        })
        .then((tx) => tx.wait());
    }

    // Deposit ETH by BoB
    const isRegisteredBob = await collateralAggregator.isRegisteredUser(
      bobSigner.address,
    );

    if (!isRegisteredBob) {
      await collateralAggregator
        .connect(bobSigner)
        .register()
        .then((tx) => tx.wait());

      await collateralVault
        .connect(bobSigner)
        .deposit(hexETHString, depositAmountInETH, {
          value: depositAmountInETH,
        })
        .then((tx) => tx.wait());
    }

    // Check collateral of Alice
    let collateralAmount = await collateralVault.getCollateralAmount(
      aliceSigner.address,
      hexETHString,
    );

    let totalPresentValue = await lendingMarketController.getTotalPresentValue(
      hexETHString,
      aliceSigner.address,
    );

    expect(collateralAmount.toString()).to.equal(depositAmountInETH);
    expect(totalPresentValue.toString()).to.equal('0');
  });

  it('Take order', async function () {
    // Get FIL market maturities & contract addresses
    const maturities = await lendingMarketController.getMaturities(
      targetCurrency,
    );
    const marketAddresses = await lendingMarketController.getLendingMarkets(
      targetCurrency,
    );
    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      marketAddresses[0],
    );

    const isMarketOpened = await lendingMarket.isOpened();
    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    // Make lend orders
    await lendingMarketController
      .connect(aliceSigner)
      .createOrder(
        targetCurrency,
        maturities[0],
        '0',
        orderAmountInFIL,
        orderRate,
      )
      .then((tx) => tx.wait());

    // Make borrow orders
    await lendingMarketController
      .connect(bobSigner)
      .createOrder(
        targetCurrency,
        maturities[0],
        '1',
        orderAmountInFIL,
        orderRate,
      )
      .then((tx) => tx.wait());

    // Check collateral of Alice
    const collateralAmountAlice = await collateralVault.getCollateralAmount(
      aliceSigner.address,
      hexETHString,
    );
    const unusedCollateralAlice =
      await collateralAggregator.getUnusedCollateral(aliceSigner.address);

    expect(collateralAmountAlice.toString()).to.equal(
      unusedCollateralAlice.toString(),
    );

    // Check collateral of Bob
    const collateralAmountBob = await collateralVault.getCollateralAmount(
      bobSigner.address,
      hexETHString,
    );
    const unusedCollateralBob = await collateralAggregator.getUnusedCollateral(
      bobSigner.address,
    );
    const totalPresentValueBob =
      await lendingMarketController.getTotalPresentValueInETH(
        bobSigner.address,
      );

    expect(collateralAmountBob.toString()).to.equal(
      unusedCollateralBob.add(totalPresentValueBob.abs()).toString(),
    );
  });
});
