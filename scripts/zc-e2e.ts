import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { LIQUIDATION_THRESHOLD_RATE, Side } from '../utils/constants';
import { hexETH, hexWFIL, toBytes32 } from '../utils/strings';

describe('ZC e2e test', async function () {
  const targetCurrency = hexWFIL;
  const BP = 10000;
  const depositAmountInETH = '10000000000000000000';
  const orderAmountInFIL = '500000000000000000';
  const orderUnitPrice = '9000';

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
  let wFILToken: Contract;
  let orderActionLogic: Contract;
  let lendingMarketReader: Contract;

  let maturities: BigNumber[];
  let orderBookIds: BigNumber[];

  const executeOrder = async (
    user: SignerWithAddress | Wallet,
    currency: string,
    maturity: BigNumber,
    side: number,
    amount: string,
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

    const wFILTokenAddress =
      process.env.TOKEN_WFIL || (await deployments.get('MockWFIL')).address;
    wFILToken = await ethers.getContractAt('MockWFIL', wFILTokenAddress);

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

    // Transfer wFIL token for testing
    await wFILToken
      .connect(ownerSigner)
      .transfer(aliceSigner.address, orderAmountInFIL)
      .then((tx) => tx.wait());

    await wFILToken
      .connect(ownerSigner)
      .transfer(bobSigner.address, orderAmountInFIL)
      .then((tx) => tx.wait());

    maturities = await lendingMarketController.getMaturities(targetCurrency);
    orderBookIds = await lendingMarketController.getOrderBookIds(
      targetCurrency,
    );
  });

  it('Deposit ETH', async function () {
    const aliceDepositAmountBefore = await tokenVault.getDepositAmount(
      aliceSigner.address,
      hexWFIL,
    );
    const bobDepositAmountBefore = await tokenVault.getDepositAmount(
      bobSigner.address,
      hexETH,
    );

    // Deposit wFIL by Alice
    if (aliceDepositAmountBefore.lt(orderAmountInFIL)) {
      const depositAmountInFIL = ethers.BigNumber.from(orderAmountInFIL).sub(
        aliceDepositAmountBefore,
      );
      await wFILToken
        .connect(aliceSigner)
        .approve(tokenVault.address, depositAmountInFIL)
        .then((tx) => tx.wait());

      await tokenVault
        .connect(aliceSigner)
        .deposit(hexWFIL, depositAmountInFIL)
        .then((tx) => tx.wait());

      const aliceDepositAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexWFIL,
      );

      expect(
        aliceDepositAmountAfter.sub(aliceDepositAmountBefore).toString(),
      ).to.equal(orderAmountInFIL);
    }

    // Deposit ETH by BoB
    if (bobDepositAmountBefore.toString() === '0') {
      await tokenVault
        .connect(bobSigner)
        .deposit(hexETH, depositAmountInETH, {
          value: depositAmountInETH,
        })
        .then((tx) => tx.wait());

      const bobDepositAmountAfter = await tokenVault.getDepositAmount(
        bobSigner.address,
        hexETH,
      );
      expect(
        bobDepositAmountAfter.sub(bobDepositAmountBefore).toString(),
      ).to.equal(depositAmountInETH);
    }
  });

  it('Unwind order', async function () {
    await tokenVault
      .connect(aliceSigner)
      .deposit(hexETH, depositAmountInETH, {
        value: depositAmountInETH,
      })
      .then((tx) => tx.wait());

    await tokenVault
      .connect(carolSigner)
      .deposit(hexETH, depositAmountInETH, {
        value: depositAmountInETH,
      })
      .then((tx) => tx.wait());

    const orderUnitPrice = await getOrderUnitPrice(hexETH, maturities[0]);

    const lendingMarket = await lendingMarketController
      .getLendingMarket(hexETH)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);

    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      hexETH,
      maturities[0],
      Side.LEND,
      depositAmountInETH,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    await executeOrder(
      bobSigner,
      hexETH,
      maturities[0],
      Side.BORROW,
      depositAmountInETH,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Create one more LEND order since orderbook is empty and maker can't unwind
    await executeOrder(
      carolSigner,
      hexETH,
      maturities[0],
      Side.LEND,
      depositAmountInETH,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    const { futureValue: aliceFVBefore } =
      await lendingMarketController.getPosition(
        hexETH,
        maturities[0],
        aliceSigner.address,
      );

    expect(aliceFVBefore).not.to.equal(0);

    await lendingMarketController
      .connect(aliceSigner)
      .unwindPosition(hexETH, maturities[0]);

    const { futureValue: aliceFV } = await lendingMarketController.getPosition(
      hexETH,
      maturities[0],
      aliceSigner.address,
    );

    expect(aliceFV).to.equal(0);
  });

  it('Cancel order', async function () {
    const lendingMarket = await lendingMarketController
      .getLendingMarket(targetCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);
    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      targetCurrency,
      maturities[0],
      Side.LEND,
      orderAmountInFIL,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    const { activeOrders } = await lendingMarketReader[
      'getOrders(bytes32,address)'
    ](targetCurrency, aliceSigner.address);

    await expect(
      lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(targetCurrency, maturities[0], activeOrders[0].orderId),
    ).to.emit(orderActionLogic.attach(lendingMarket.address), 'OrderCanceled');
  });

  it('Take order', async function () {
    const lendingMarket = await lendingMarketController
      .getLendingMarket(targetCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const futureValueVaultAddresses =
      await lendingMarketController.getFutureValueVault(targetCurrency);

    const futureValueVault = await ethers.getContractAt(
      'FutureValueVault',
      futureValueVaultAddresses,
    );

    const orderUnitPrice = await getOrderUnitPrice(
      targetCurrency,
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
          .getPosition(targetCurrency, maturities[0], address)
          .then(({ futureValue }) => futureValue),
      ),
    );

    const { workingBorrowOrdersAmount: workingOrdersAmountBefore } =
      await lendingMarketController.calculateFunds(
        targetCurrency,
        bobSigner.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

    // Make lend orders
    await executeOrder(
      aliceSigner,
      targetCurrency,
      maturities[0],
      Side.LEND,
      orderAmountInFIL,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Make borrow orders
    await executeOrder(
      bobSigner,
      targetCurrency,
      maturities[0],
      Side.BORROW,
      orderAmountInFIL,
      orderUnitPrice,
    ).then((tx) => tx.wait());

    // Calculate the future value from order unitPrice & amount
    // NOTE: The formula is: futureValue = amount / unitPrice.
    const calculatedFV = BigNumberJS(orderAmountInFIL)
      .times(BP)
      .div(orderUnitPrice.toNumber())
      .dp(0)
      .toFixed();

    // Check the future values
    const [aliceFVAfter, bobFVAfter, reserveFundFVAfter] = await Promise.all(
      [aliceSigner, bobSigner, reserveFund].map(({ address }) =>
        lendingMarketController
          .getPosition(targetCurrency, maturities[0], address)
          .then(({ futureValue }) => futureValue),
      ),
    );
    const orderFee = reserveFundFVAfter.sub(reserveFundFVBefore);

    expect(aliceFVAfter.sub(aliceFVBefore)).to.equal(calculatedFV);
    expect(bobFVAfter.sub(bobFVBefore).add(orderFee).abs()).to.equal(
      calculatedFV,
    );

    await lendingMarketController.cleanUpFunds(
      targetCurrency,
      aliceSigner.address,
    );
    const [aliceFVInFutureValue] = await futureValueVault.getBalance(
      orderBookIds[0],
      aliceSigner.address,
    );

    expect(aliceFVAfter).to.equal(aliceFVInFutureValue);

    // Check the future value and working amount of Bob
    const { workingBorrowOrdersAmount: workingOrdersAmountAfter } =
      await lendingMarketController.calculateFunds(
        targetCurrency,
        bobSigner.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

    expect(workingOrdersAmountAfter).to.equal(workingOrdersAmountBefore);
  });

  it('Withdraw WFIL', async function () {
    await wFILToken
      .connect(bobSigner)
      .approve(tokenVault.address, orderAmountInFIL)
      .then((tx) => tx.wait());

    await tokenVault
      .connect(bobSigner)
      .deposit(hexWFIL, orderAmountInFIL)
      .then((tx) => tx.wait());

    const bobDepositAmountBefore = await tokenVault.getDepositAmount(
      bobSigner.address,
      hexWFIL,
    );
    const withdrawAmount = '100000';

    await tokenVault
      .connect(bobSigner)
      .withdraw(hexWFIL, withdrawAmount)
      .then((tx) => tx.wait());

    const bobDepositAmountAfter = await tokenVault.getDepositAmount(
      bobSigner.address,
      hexWFIL,
    );

    expect(
      bobDepositAmountBefore.sub(bobDepositAmountAfter).toString(),
    ).to.equal(withdrawAmount);
  });

  it('Execute auto-roll', async function () {
    const orderUnitPrice = await getOrderUnitPrice(hexETH, maturities[0]);

    const lendingMarket = await lendingMarketController
      .getLendingMarket(hexETH)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const isMarketOpened = await lendingMarket.isOpened(orderBookIds[0]);

    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await executeOrder(
      aliceSigner,
      hexETH,
      maturities[0],
      Side.LEND,
      '100000000000000000',
      orderUnitPrice,
    ).then((tx) => tx.wait());
    await executeOrder(
      bobSigner,
      hexETH,
      maturities[0],
      Side.BORROW,
      '100000000000000000',
      orderUnitPrice,
    ).then((tx) => tx.wait());

    const { futureValue: aliceFVBefore } =
      await lendingMarketController.getPosition(
        hexETH,
        maturities[0],
        aliceSigner.address,
      );

    await time.increaseTo(maturities[0].toString());

    await lendingMarketController.connect(ownerSigner).rotateOrderBooks(hexETH);

    await lendingMarketController
      .connect(ownerSigner)
      .executeItayoseCall(hexETH, maturities[maturities.length - 1]);

    const position = await lendingMarketController.getPosition(
      hexETH,
      maturities[1],
      aliceSigner.address,
    );

    const { futureValue: aliceActualFV } =
      await lendingMarketController.getPosition(
        hexETH,
        maturities[0],
        aliceSigner.address,
      );

    expect(aliceActualFV).to.equal('0');

    expect(position.futureValue).not.to.equal('0');
    expect(position.presentValue).not.to.equal('0');
    expect(aliceFVBefore.gt(position.futureValue));
  });
});
