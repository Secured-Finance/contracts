import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { LIQUIDATION_THRESHOLD_RATE, Side } from '../utils/constants';
import { toBytes32 } from '../utils/strings';

const INITIAL_CURRENCIES = (
  process.env.INITIAL_CURRENCIES || 'USDC,WBTC,WETH,WFIL'
).split(',');

const NATIVE_CURRENCY_SYMBOL = process.env.NATIVE_CURRENCY_SYMBOL || 'ETH';

describe('ZC e2e test', async function () {
  const BP = 10000;
  const depositAmount = BigNumber.from('100000000000000000');
  let orderAmount: BigNumber;

  // Accounts
  let ownerSigner: SignerWithAddress | Wallet;
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;

  // Contracts
  let proxyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let reserveFund: Contract;
  let orderActionLogic: Contract;
  let lendingMarketReader: Contract;

  let maturities: BigNumber[];
  let orderBookIds: BigNumber[];

  let nativeCurrency: string;

  const executeOrder = async (
    user: SignerWithAddress | Wallet,
    currency: string,
    maturity: BigNumber,
    side: number,
    amount: string | BigNumber,
    unitPrice: string | BigNumber,
  ) => {
    const estimatedGas = await lendingMarketController
      .connect(user)
      .estimateGas.executeOrder(currency, maturity, side, amount, unitPrice);

    return lendingMarketController
      .connect(user)
      .executeOrder(currency, maturity, side, amount, unitPrice, {
        gasLimit: estimatedGas.mul(11).div(10),
      });
  };

  const getOrderUnitPrice = async (
    currency: string,
    maturity: BigNumber,
  ): Promise<BigNumber> => {
    const marketDetail = await lendingMarketReader.getOrderBookDetail(
      currency,
      maturity,
    );

    const midUnitPrice = marketDetail.bestLendUnitPrice
      .add(marketDetail.bestBorrowUnitPrice)
      .div(2);

    if (midUnitPrice.gt(marketDetail.maxLendUnitPrice)) {
      return marketDetail.maxLendUnitPrice;
    } else if (midUnitPrice.lt(marketDetail.minBorrowUnitPrice)) {
      return marketDetail.minBorrowUnitPrice;
    } else {
      return midUnitPrice;
    }
  };

  before('Set up for testing', async function () {
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

    // Set currencies
    nativeCurrency = toBytes32(NATIVE_CURRENCY_SYMBOL);

    if (!INITIAL_CURRENCIES.includes(NATIVE_CURRENCY_SYMBOL)) {
      console.log('Skip the all steps since no native currency is registered');
      this.skip();
    }

    // Get ETH
    if (process.env.FORK_RPC_ENDPOINT) {
      const params = [[ownerSigner.address], ethers.utils.hexValue(10)];
      await ethers.provider.send('tenderly_addBalance', params);
    }

    // Get external contracts
    lendingMarketReader = await deployments
      .get('LendingMarketReader')
      .then(({ address }) =>
        ethers.getContractAt('LendingMarketReader', address),
      );

    // Get contracts
    const getProxy = (key: string) =>
      proxyController
        .getAddress(toBytes32(key))
        .then((address) => ethers.getContractAt(key, address));

    proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    orderActionLogic = await deployments
      .get('OrderActionLogic')
      .then(({ address }) => ethers.getContractAt('OrderActionLogic', address));

    // Get proxy contracts
    tokenVault = await getProxy('TokenVault');
    lendingMarketController = await getProxy('LendingMarketController');
    reserveFund = await getProxy('ReserveFund');

    console.table(
      {
        proxyController,
        tokenVault,
        lendingMarketController,
        reserveFund,
        lendingMarketReader,
      },
      ['address'],
    );

    orderAmount = depositAmount.div(10);

    maturities = await lendingMarketController.getMaturities(nativeCurrency);
    orderBookIds = await lendingMarketController.getOrderBookIds(
      nativeCurrency,
    );
  });

  it('Deposit', async function () {
    const aliceDepositAmountBefore = await tokenVault.getDepositAmount(
      aliceSigner.address,
      nativeCurrency,
    );
    const bobDepositAmountBefore = await tokenVault.getDepositAmount(
      bobSigner.address,
      nativeCurrency,
    );

    // Deposit wFIL by Alice
    if (aliceDepositAmountBefore.lt(orderAmount)) {
      const depositAmount = orderAmount.sub(aliceDepositAmountBefore);

      await tokenVault
        .connect(aliceSigner)
        .deposit(nativeCurrency, depositAmount, { value: depositAmount })
        .then((tx) => tx.wait());

      const aliceDepositAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        nativeCurrency,
      );

      expect(
        aliceDepositAmountAfter.sub(aliceDepositAmountBefore).toString(),
      ).to.equal(orderAmount);
    }

    // Deposit ETH by BoB
    if (bobDepositAmountBefore.toString() === '0') {
      await tokenVault
        .connect(bobSigner)
        .deposit(nativeCurrency, depositAmount, {
          value: depositAmount,
        })
        .then((tx) => tx.wait());

      const bobDepositAmountAfter = await tokenVault.getDepositAmount(
        bobSigner.address,
        nativeCurrency,
      );
      expect(
        bobDepositAmountAfter.sub(bobDepositAmountBefore).toString(),
      ).to.equal(depositAmount);
    }
  });

  it('Unwind order', async function () {
    await tokenVault
      .connect(aliceSigner)
      .deposit(nativeCurrency, depositAmount, {
        value: depositAmount,
      })
      .then((tx) => tx.wait());

    await tokenVault
      .connect(carolSigner)
      .deposit(nativeCurrency, depositAmount, {
        value: depositAmount,
      })
      .then((tx) => tx.wait());

    const orderUnitPrice = await getOrderUnitPrice(
      nativeCurrency,
      maturities[0],
    );

    const lendingMarket = await lendingMarketController
      .getLendingMarket(nativeCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);

    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      nativeCurrency,
      maturities[0],
      Side.LEND,
      depositAmount.div(2),
      orderUnitPrice,
    ).then((tx) => tx.wait());

    await executeOrder(
      bobSigner,
      nativeCurrency,
      maturities[0],
      Side.BORROW,
      depositAmount.div(2),
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Create one more LEND order since orderbook is empty and maker can't unwind
    await executeOrder(
      carolSigner,
      nativeCurrency,
      maturities[0],
      Side.LEND,
      depositAmount.div(2),
      orderUnitPrice,
    ).then((tx) => tx.wait());

    const { futureValue: aliceFVBefore } =
      await lendingMarketController.getPosition(
        nativeCurrency,
        maturities[0],
        aliceSigner.address,
      );

    expect(aliceFVBefore).not.to.equal(0);

    await lendingMarketController
      .connect(aliceSigner)
      .unwindPosition(nativeCurrency, maturities[0])
      .then((tx) => tx.wait());

    const { futureValue: aliceFV } = await lendingMarketController.getPosition(
      nativeCurrency,
      maturities[0],
      aliceSigner.address,
    );

    expect(aliceFV).to.equal(0);
  });

  it('Cancel order', async function () {
    const lendingMarket = await lendingMarketController
      .getLendingMarket(nativeCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);
    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      nativeCurrency,
      maturities[0],
      Side.LEND,
      orderAmount,
      '1',
    ).then((tx) => tx.wait());

    const { activeOrders } = await lendingMarketReader[
      'getOrders(bytes32,address)'
    ](nativeCurrency, aliceSigner.address);

    await expect(
      lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(nativeCurrency, maturities[0], activeOrders[0].orderId),
    ).to.emit(orderActionLogic.attach(lendingMarket.address), 'OrderCanceled');
  });

  it('Take order', async function () {
    const lendingMarket = await lendingMarketController
      .getLendingMarket(nativeCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const futureValueVaultAddresses =
      await lendingMarketController.getFutureValueVault(nativeCurrency);

    const futureValueVault = await ethers.getContractAt(
      'FutureValueVault',
      futureValueVaultAddresses,
    );

    const orderUnitPrice = await getOrderUnitPrice(
      nativeCurrency,
      maturities[0],
    );

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);
    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    const [aliceFVBefore, bobFVBefore, reserveFundFVBefore] = await Promise.all(
      [aliceSigner, bobSigner, reserveFund].map(({ address }) =>
        lendingMarketController
          .getPosition(nativeCurrency, maturities[0], address)
          .then(({ futureValue }) => futureValue),
      ),
    );

    const { workingBorrowOrdersAmount: workingOrdersAmountBefore } =
      await lendingMarketController.calculateFunds(
        nativeCurrency,
        bobSigner.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

    // Make lend orders
    await executeOrder(
      aliceSigner,
      nativeCurrency,
      maturities[0],
      Side.LEND,
      orderAmount,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Make borrow orders
    await executeOrder(
      bobSigner,
      nativeCurrency,
      maturities[0],
      Side.BORROW,
      orderAmount,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Calculate the future value from order unitPrice & amount
    // NOTE: The formula is: futureValue = amount / unitPrice.
    const calculatedFV = BigNumberJS(orderAmount.toString())
      .times(BP)
      .div(orderUnitPrice.toNumber())
      .dp(0)
      .toFixed();

    // Check the future values
    const [aliceFVAfter, bobFVAfter, reserveFundFVAfter] = await Promise.all(
      [aliceSigner, bobSigner, reserveFund].map(({ address }) =>
        lendingMarketController
          .getPosition(nativeCurrency, maturities[0], address)
          .then(({ futureValue }) => futureValue),
      ),
    );
    const orderFee = reserveFundFVAfter.sub(reserveFundFVBefore);

    expect(aliceFVAfter.sub(aliceFVBefore)).to.equal(calculatedFV);
    expect(bobFVAfter.sub(bobFVBefore).add(orderFee).abs()).to.equal(
      calculatedFV,
    );

    await lendingMarketController
      .cleanUpFunds(nativeCurrency, aliceSigner.address)
      .then((tx) => tx.wait());
    const [aliceFVInFutureValue] = await futureValueVault.getBalance(
      orderBookIds[0],
      aliceSigner.address,
    );

    expect(aliceFVAfter).to.equal(aliceFVInFutureValue);

    // Check the future value and working amount of Bob
    const { workingBorrowOrdersAmount: workingOrdersAmountAfter } =
      await lendingMarketController.calculateFunds(
        nativeCurrency,
        bobSigner.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

    expect(workingOrdersAmountAfter).to.equal(workingOrdersAmountBefore);
  });

  it('Withdraw', async function () {
    await tokenVault
      .connect(bobSigner)
      .deposit(nativeCurrency, orderAmount, { value: orderAmount })
      .then((tx) => tx.wait());

    const bobDepositAmountBefore = await tokenVault.getDepositAmount(
      bobSigner.address,
      nativeCurrency,
    );
    const withdrawAmount = '100000';

    await tokenVault
      .connect(bobSigner)
      .withdraw(nativeCurrency, withdrawAmount)
      .then((tx) => tx.wait());

    const bobDepositAmountAfter = await tokenVault.getDepositAmount(
      bobSigner.address,
      nativeCurrency,
    );

    expect(
      bobDepositAmountBefore.sub(bobDepositAmountAfter).toString(),
    ).to.equal(withdrawAmount);
  });

  it('Execute auto-roll', async function () {
    const orderUnitPrice = await getOrderUnitPrice(
      nativeCurrency,
      maturities[0],
    );

    const lendingMarket = await lendingMarketController
      .getLendingMarket(nativeCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);

    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      nativeCurrency,
      maturities[0],
      Side.LEND,
      depositAmount.div(100),
      orderUnitPrice,
    ).then((tx) => tx.wait());

    await executeOrder(
      bobSigner,
      nativeCurrency,
      maturities[0],
      Side.BORROW,
      depositAmount.div(100),
      orderUnitPrice,
    ).then((tx) => tx.wait());

    const { futureValue: aliceFVBefore } =
      await lendingMarketController.getPosition(
        nativeCurrency,
        maturities[0],
        aliceSigner.address,
      );

    await time.increaseTo(maturities[0].toString());

    await lendingMarketController
      .connect(ownerSigner)
      .rotateOrderBooks(nativeCurrency)
      .then((tx) => tx.wait());

    await lendingMarketController
      .connect(ownerSigner)
      .executeItayoseCall(nativeCurrency, maturities[maturities.length - 1])
      .then((tx) => tx.wait());

    const position = await lendingMarketController.getPosition(
      nativeCurrency,
      maturities[1],
      aliceSigner.address,
    );

    const { futureValue: aliceActualFV } =
      await lendingMarketController.getPosition(
        nativeCurrency,
        maturities[0],
        aliceSigner.address,
      );

    expect(aliceActualFV).to.equal('0');

    expect(position.futureValue).not.to.equal('0');
    expect(position.presentValue).not.to.equal('0');
    expect(aliceFVBefore.gt(position.futureValue));
  });
});
