import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract, Wallet } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { hexETHString, hexFILString, toBytes32 } from '../utils/strings';

describe('ZC e2e test', async () => {
  const targetCurrency = hexFILString;
  const BP = 100;
  const depositAmountInETH = '10000000000000000000';
  const orderAmountInFIL = '50000000000000000000';
  const orderRate = String(3 * BP);
  const SECONDS_IN_YEAR = 31557600;

  // Accounts
  let ownerSigner: SignerWithAddress | Wallet;
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;

  // Contracts
  let proxyController: Contract;
  let collateralAggregator: Contract;
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
    lendingMarketController = await getProxy('LendingMarketController');

    console.table(
      {
        proxyController,
        collateralAggregator,
        lendingMarketController,
      },
      ['address'],
    );
  });

  it('Deposit ETH', async () => {
    let collateralAmount = await collateralAggregator.getCollateralAmount(
      bobSigner.address,
      hexETHString,
    );

    if (collateralAmount.toString() === '0') {
      // Deposit ETH by BoB
      await collateralAggregator
        .connect(bobSigner)
        .deposit(hexETHString, depositAmountInETH, {
          value: depositAmountInETH,
        })
        .then((tx) => tx.wait());
    }

    collateralAmount = await collateralAggregator.getCollateralAmount(
      bobSigner.address,
      hexETHString,
    );

    let totalPresentValue = await lendingMarketController.getTotalPresentValue(
      hexETHString,
      bobSigner.address,
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

    const [futureValueAliceBefore] = await lendingMarket.getFutureValue(
      aliceSigner.address,
    );
    const [futureValueBobBefore] = await lendingMarket.getFutureValue(
      bobSigner.address,
    );

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
    const receipt = await lendingMarketController
      .connect(bobSigner)
      .createOrder(
        targetCurrency,
        maturities[0],
        '1',
        orderAmountInFIL,
        orderRate,
      )
      .then((tx) => tx.wait());

    // Calculate the future value from order rate & amount
    // NOTE: The formula is: futureValue = amount * (1 + rate * (maturity - now) / 360 days).
    const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);
    const dt = maturities[0] - timestamp;
    const currentRate = ethers.BigNumber.from(orderRate)
      .mul(dt)
      .div(SECONDS_IN_YEAR);
    const calculatedFV = ethers.BigNumber.from(orderAmountInFIL)
      .mul(currentRate.add(ethers.BigNumber.from(100).mul(BP)))
      .div(BP)
      .div(100);

    // Check collateral of Alice
    const collateralAmountAlice =
      await collateralAggregator.getCollateralAmount(
        aliceSigner.address,
        hexETHString,
      );
    const unusedCollateralAlice =
      await collateralAggregator.getUnusedCollateral(aliceSigner.address);
    const [futureValueAliceAfter] = await lendingMarket.getFutureValue(
      aliceSigner.address,
    );

    expect(collateralAmountAlice.toString()).to.equal(
      unusedCollateralAlice.toString(),
    );
    expect(
      futureValueAliceAfter.sub(futureValueAliceBefore).toString(),
    ).to.equal(calculatedFV.toString());

    // Check collateral of Bob
    const unsettledCollateralBob =
      await collateralAggregator.getUnsettledCollateral(
        bobSigner.address,
        targetCurrency,
      );
    const [futureValueBobAfter] = await lendingMarket.getFutureValue(
      bobSigner.address,
    );

    expect(unsettledCollateralBob.toString()).to.equal('0');
    expect(futureValueBobAfter.sub(futureValueBobBefore).toString()).to.equal(
      `-${calculatedFV.toString()}`,
    );
  });
});
