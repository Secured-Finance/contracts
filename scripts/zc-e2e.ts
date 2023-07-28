import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { LIQUIDATION_THRESHOLD_RATE } from '../test/common/constants';
import { Side } from '../utils/constants';
import { hexETH, hexWFIL, toBytes32 } from '../utils/strings';

describe('ZC e2e test', async () => {
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

  let maturities: BigNumber[];

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
      },
      ['address'],
    );

    // Transfer wFIL token for testing
    await wFILToken
      .connect(ownerSigner)
      .transfer(aliceSigner.address, orderAmountInFIL)
      .then((tx) => tx.wait());

    maturities = await lendingMarketController.getMaturities(targetCurrency);
  });

  it('Deposit ETH', async () => {
    const aliceDepositAmountBefore = await tokenVault.getDepositAmount(
      aliceSigner.address,
      hexWFIL,
    );
    const bobDepositAmountBefore = await tokenVault.getDepositAmount(
      bobSigner.address,
      hexETH,
    );

    // Deposit ETH by Alice
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

  it('Cancel order', async function () {
    const marketAddress = await lendingMarketController.getLendingMarket(
      targetCurrency,
      maturities[0],
    );

    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      marketAddress,
    );

    const isMarketOpened = await lendingMarket.isOpened();
    if (!isMarketOpened) {
      console.log('Skip the order step since the market not open');
      this.skip();
    }

    await lendingMarketController
      .connect(aliceSigner)
      .executeOrder(
        targetCurrency,
        maturities[0],
        Side.LEND,
        orderAmountInFIL,
        orderUnitPrice,
      )
      .then((tx) => tx.wait());

    const { activeOrders } = await lendingMarketController.getOrders(
      [targetCurrency],
      aliceSigner.address,
    );

    await expect(
      lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(targetCurrency, maturities[0], activeOrders[0].orderId),
    ).to.emit(lendingMarket, 'OrderCanceled');
  });

  it('Take order', async function () {
    const marketAddress = await lendingMarketController.getLendingMarket(
      targetCurrency,
      maturities[0],
    );
    const futureValueVaultAddresses =
      await lendingMarketController.getFutureValueVault(
        targetCurrency,
        maturities[0],
      );

    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      marketAddress,
    );
    const futureValueVault = await ethers.getContractAt(
      'FutureValueVault',
      futureValueVaultAddresses,
    );

    const isMarketOpened = await lendingMarket.isOpened();
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
    await lendingMarketController
      .connect(aliceSigner)
      .executeOrder(
        targetCurrency,
        maturities[0],
        Side.LEND,
        orderAmountInFIL,
        orderUnitPrice,
      )
      .then((tx) => tx.wait());

    // Make borrow orders
    await lendingMarketController
      .connect(bobSigner)
      .executeOrder(
        targetCurrency,
        maturities[0],
        Side.BORROW,
        orderAmountInFIL,
        orderUnitPrice,
      )
      .then((tx) => tx.wait());

    // Calculate the future value from order unitPrice & amount
    // NOTE: The formula is: futureValue = amount / unitPrice.
    const calculatedFV = BigNumberJS(orderAmountInFIL)
      .times(BP)
      .div(orderUnitPrice)
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
    const [aliceFVInFutureValueVault] = await futureValueVault.getFutureValue(
      aliceSigner.address,
    );

    expect(aliceFVAfter).to.equal(aliceFVInFutureValueVault);

    // Check the future value and working amount of Bob
    const { workingBorrowOrdersAmount: workingOrdersAmountAfter } =
      await lendingMarketController.calculateFunds(
        targetCurrency,
        bobSigner.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

    expect(workingOrdersAmountAfter).to.equal(workingOrdersAmountBefore);
  });

  it('Withdraw WFIL', async () => {
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
});
