import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { parse } from 'csv-parse/sync';
import { BigNumber, Contract } from 'ethers';
import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';
import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

interface PositionComparisonResult {
  currency: string;

  maturity: number;
  totalLendAmount: string;
  totalBorrowAmount: string;
  difference: string;
  lendBorrowRatio: number;
  userCount: number;
}

interface Position {
  ccy: string;
  maturity: number;
  presentValue: BigNumber; // Use BigNumber for amounts
  side: 'LEND' | 'BORROW';
}

describe('Performance Test: Order Replay', function () {
  let currencyController: Contract;
  let lendingMarketController: Contract;
  let lendingMarketReader: Contract;
  let tokenVault: Contract;
  let reserveFund: Contract;
  let signers: SignerWithAddress[];
  let userMap: Record<string, SignerWithAddress> = {};
  let testMaturities: string[] = [];
  let maturities: BigNumber[] = [];
  let genesisDate: number;
  let wFILToken: Contract;
  let ethToUSDPriceFeed: Contract;

  const initialWFILBalance = ethers.utils.parseUnits('10000000', 18); // 10,000,000 WFIL (18 decimals)
  let preItayose: Array<Record<string, string>> = [];
  let postItayose: Array<Record<string, string>> = [];
  let ccy: string;
  let liquidator: SignerWithAddress;

  const showOrderBook = async (limit = 10) => {
    for (let mIdx = 0; mIdx < testMaturities.length; mIdx++) {
      const maturity = maturities[mIdx];
      const borrowUnitPrices = await lendingMarketReader.getBorrowOrderBook(
        ccy,
        maturity,
        0,
        limit,
      );
      const lendUnitPrices = await lendingMarketReader.getLendOrderBook(
        ccy,
        maturity,
        0,
        limit,
      );

      const getOrderBookObject = (obj: {
        unitPrices: BigNumber[];
        amounts: BigNumber[];
        quantities: BigNumber[];
      }) => {
        return obj.unitPrices.map((unitPrice, idx) => ({
          unitPrice,
          amount: obj.amounts[idx],
          quantity: obj.quantities[idx],
        }));
      };

      const orderBook = [
        ...getOrderBookObject(borrowUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .sort((a, b) => (a.unitPrice.lte(b.unitPrice) ? 1 : -1))
          .map(({ unitPrice, amount, quantity }) => ({
            Borrow: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
        ...getOrderBookObject(lendUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .map(({ unitPrice, amount, quantity }) => ({
            Lend: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
      ];

      console.log(`Current order book (${maturity}) is:`);
      console.table(orderBook);
    }
  };

  const calculateTotalAmountForOrderBook = async (
    ccy: string,
    maturity: BigNumber,
    userAddresses: SignerWithAddress[],
  ): Promise<{
    totalAmount: BigNumber;
    userCount: number;
  }> => {
    const lendingMarketAddress = await lendingMarketController.getLendingMarket(
      ccy,
    );
    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      lendingMarketAddress,
    );
    const orderBookId = await lendingMarketController.getOrderBookId(
      ccy,
      maturity,
    );

    let totalAmount = BigNumber.from(0);
    let userCount = 0;

    // Prepare jobs per user
    const jobs: Array<
      () => Promise<{ userTotal: BigNumber; hasOrders: boolean }>
    > = userAddresses.map((user) => async () => {
      let userTotal = BigNumber.from(0);
      let hasOrders = false;

      // Get order IDs for this user and order book
      const { inActiveOrderIds: lendOrderIds } =
        await lendingMarket.getLendOrderIds(orderBookId, user.address);
      const { inActiveOrderIds: borrowOrderIds } =
        await lendingMarket.getBorrowOrderIds(orderBookId, user.address);
      // Combine all order IDs
      const allOrderIds = [...lendOrderIds, ...borrowOrderIds];

      // Calculate total amount for this user and order book
      for (const orderId of allOrderIds) {
        try {
          const order = await lendingMarket.getOrder(orderBookId, orderId);
          if (order && order.amount) {
            userTotal = userTotal.add(order.amount);
            hasOrders = true;
          }
        } catch (error) {
          console.warn(
            `Error getting order ${orderId} for user ${user}, order book ${orderBookId}:`,
            error,
          );
        }
      }
      return { userTotal, hasOrders };
    });

    // Run jobs in parallel batches
    const CONCURRENCY = 300;
    let processed = 0;
    while (jobs.length > 0) {
      const batch = jobs.splice(0, CONCURRENCY);
      const batchResults = await Promise.all(batch.map((fn) => fn()));
      for (const { userTotal, hasOrders } of batchResults) {
        totalAmount = totalAmount.add(userTotal);
        if (hasOrders) userCount++;
      }
      processed += batch.length;
      process.stdout.write(
        `\rProcessed users in orderBookId ${orderBookId}: ${processed}/${userAddresses.length}`,
      );
    }
    process.stdout.write('\n');

    return { totalAmount, userCount };
  };

  const showPendingOrderAmounts = async () => {
    const tableData: Record<string, string | number>[] = [];
    for (let mIdx = 0; mIdx < testMaturities.length; mIdx++) {
      const maturityVal = maturities[mIdx];
      const { totalAmount, userCount } = await calculateTotalAmountForOrderBook(
        ccy,
        maturityVal,
        signers,
      );
      const pendingOrderAmount =
        await lendingMarketController.getPendingOrderAmount(ccy, maturityVal);
      const difference = totalAmount.sub(pendingOrderAmount);
      tableData.push({
        Maturity: maturityVal.toString(),
        TotalAmount: totalAmount.toString(),
        PendingOrderAmount: pendingOrderAmount.toString(),
        UserCount: userCount,
      });
      if (!difference.isZero()) {
        throw new Error(`Diff is not zero for maturity ${maturityVal}!`);
      }
    }
    console.table(tableData);
  };

  const getUserPositions = async (userAddress: string): Promise<Position[]> => {
    try {
      const positions = await lendingMarketReader[
        'getPositions(bytes32,address)'
      ](ccy, userAddress);

      const result: Position[] = [];

      // Process positions based on presentValue sign
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const presentValue = position.presentValue;

        if (presentValue && !presentValue.isZero()) {
          // If presentValue is positive, it's a lending position
          // If presentValue is negative, it's a borrowing position
          const side = presentValue.gt(0) ? 'LEND' : 'BORROW';

          result.push({
            ccy: position.ccy,
            maturity: Number(position.maturity),
            presentValue: presentValue.abs(), // Use absolute value for amount
            side,
          });
        }
      }

      return result;
    } catch (error) {
      console.warn(`Error getting positions for user ${userAddress}:`, error);
      return [];
    }
  };

  const showPositionsPerMaturity = async (
    userAddresses: string[],
  ): Promise<void> => {
    const results: PositionComparisonResult[] = [];

    // Create a map to store totals per currency and maturity
    const positionMap = new Map<
      string,
      {
        lendAmount: BigNumber;
        borrowAmount: BigNumber;
        userCount: number;
      }
    >();

    // Process users in parallel batches
    const CONCURRENCY = 200;
    let processed = 0;
    const totalUsers = userAddresses.length;

    while (processed < totalUsers) {
      const batch = userAddresses.slice(processed, processed + CONCURRENCY);

      const batchPromises = batch.map(async (userAddress) => {
        try {
          const positions = await getUserPositions(userAddress);

          // Group positions by currency and maturity
          const userPositions = new Map<
            string,
            {
              lendAmount: BigNumber;
              borrowAmount: BigNumber;
            }
          >();

          for (const position of positions) {
            const key = `${position.ccy}-${position.maturity}`;
            const current = userPositions.get(key) || {
              lendAmount: BigNumber.from(0),
              borrowAmount: BigNumber.from(0),
            };

            if (position.side === 'LEND') {
              current.lendAmount = current.lendAmount.add(
                position.presentValue,
              );
            } else {
              current.borrowAmount = current.borrowAmount.add(
                position.presentValue,
              );
            }

            userPositions.set(key, current);
          }

          return userPositions;
        } catch (error) {
          console.warn(`Error processing user ${userAddress}:`, error);
          return new Map();
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results from this batch
      for (const userPositions of batchResults) {
        for (const [key, amounts] of userPositions) {
          const current = positionMap.get(key) || {
            lendAmount: BigNumber.from(0),
            borrowAmount: BigNumber.from(0),
            userCount: 0,
          };

          current.lendAmount = current.lendAmount.add(amounts.lendAmount);
          current.borrowAmount = current.borrowAmount.add(amounts.borrowAmount);
          current.userCount++;

          positionMap.set(key, current);
        }
      }

      processed += batch.length;
      process.stdout.write(`\rProcessed users: ${processed}/${totalUsers}`);
    }
    process.stdout.write('\n');

    // Convert map to results array
    for (const [key, totals] of positionMap) {
      const [currency, maturityStr] = key.split('-');
      const maturity = parseInt(maturityStr, 10);
      const currencyName = ethers.utils.parseBytes32String(currency);

      const difference = totals.lendAmount.sub(totals.borrowAmount);
      const lendBorrowRatio = totals.borrowAmount.isZero()
        ? totals.lendAmount.isZero()
          ? 0
          : Infinity
        : Number(ethers.utils.formatEther(totals.lendAmount)) /
          Number(ethers.utils.formatEther(totals.borrowAmount));

      results.push({
        currency: currencyName,
        maturity,
        totalLendAmount: totals.lendAmount.toString(),
        totalBorrowAmount: totals.borrowAmount.toString(),
        difference: difference.toString(),
        lendBorrowRatio,
        userCount: totals.userCount,
      });
    }

    // Sort results by currency and maturity
    results.sort((a, b) => {
      if (a.currency !== b.currency) {
        return a.currency.localeCompare(b.currency);
      }
      return a.maturity - b.maturity;
    });

    console.table(results);
  };

  before(async () => {
    signers = await ethers.getSigners();
    // Deploy contracts and assign lendingMarketController as in order-book.test.ts
    ({
      genesisDate,
      currencyController,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      reserveFund,
      wFILToken,
      ethToUSDPriceFeed,
    } = await deployContracts());

    // Get liquidator from environment variable or use a default signer
    const liquidatorAddress = process.env.REPLAY_TEST_LIQUIDATOR_ADDRESS;
    if (!liquidatorAddress) {
      throw new Error(
        'REPLAY_TEST_LIQUIDATOR_ADDRESS environment variable is not set',
      );
    }
    // liquidator =
    //   signers.find((signer) => signer.address === liquidatorAddress) ||
    //   signers[signers.length - 1];
    liquidator = getUserSigner(liquidatorAddress);
    console.log('Liquidator address:', liquidator.address);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexWFIL, true);
    await tokenVault.updateCurrency(hexETH, true);

    // Deploy Lending Markets for WFIL market
    for (let i = 0; i < 3; i++) {
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate + 7200,
        genesisDate - 3600,
      );
    }

    // Read REPLAY_TEST_MATURITIES from environment variable
    const testMaturitiesEnv = process.env.REPLAY_TEST_MATURITIES;
    if (!testMaturitiesEnv) {
      throw new Error('REPLAY_TEST_MATURITIES environment variable is not set');
    }
    testMaturities = testMaturitiesEnv.split(',').map((s) => s.trim());

    maturities = await lendingMarketController.getMaturities(hexWFIL);

    // --- WFIL(ERC20) Setup: Transfer and Approve for all users ---
    // wFILToken should be an ERC20 contract instance
    // Owner is signers[0]
    // for (const user of signers) {
    //   // Transfer WFIL from owner to user
    //   await Promise.all([
    //     wFILToken
    //       .connect(signers[0])
    //       .transfer(user.address, initialWFILBalance),
    //     wFILToken.connect(user).approve(tokenVault.address, initialWFILBalance),
    //   ]);
    // }

    const jobs: Array<() => Promise<void>> = signers.map((user) => async () => {
      await Promise.all([
        wFILToken
          .connect(signers[0])
          .transfer(user.address, initialWFILBalance),
        wFILToken.connect(user).approve(tokenVault.address, initialWFILBalance),
      ]);
    });

    const CONCURRENCY = 200;
    while (jobs.length > 0) {
      const batch = jobs.splice(0, CONCURRENCY);
      await Promise.all(batch.map((fn) => fn()));
      process.stdout.write(
        `\rTransferred WFIL to users: ${signers.length - jobs.length}/${
          signers.length
        }`,
      );
    }

    // Read and parse CSV
    const csvPath = path.join(__dirname, 'inputs', 'order-replay-data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const records: Array<Record<string, string>> = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    // Split records into pre-Itayose and post-Itayose
    let itayoseIndex = records.findIndex(
      (r) => r['Event'] !== 'PreOrderExecuted',
    );
    if (itayoseIndex === -1) itayoseIndex = records.length;
    for (let i = 0; i < records.length; i++) {
      if (i < itayoseIndex) preItayose.push(records[i]);
      else postItayose.push(records[i]);
    }

    // Use WFIL/first maturity for all events
    ccy = hexWFIL;
  });

  after(async () => {
    await ethers.provider.send('evm_setAutomine', [true]);
  });

  function getUserSigner(userId: string) {
    if (!userMap[userId]) {
      // Assign next available signer
      userMap[userId] = signers[Object.keys(userMap).length];
    }
    return userMap[userId];
  }

  function getSide(sideStr: string) {
    // CSV: 0 = LEND, 1 = BORROW
    return sideStr === '0' ? Side.LEND : Side.BORROW;
  }

  // Helper to get maturity for a record
  function getMaturityForRecord(maturityStr: string): BigNumber {
    const idx = testMaturities.indexOf(maturityStr);
    if (idx === -1) {
      throw new Error(
        `Maturity ${maturityStr} not found in REPLAY_TEST_MATURITIES`,
      );
    }
    if (!maturities[idx]) {
      throw new Error(`No maturities[${idx}] for Maturity ${maturityStr}`);
    }
    return maturities[idx];
  }

  describe('should replay orders from CSV', async function () {
    it('PreItayose', async function () {
      for (let i = 0; i < preItayose.length; i++) {
        const record = preItayose[i];
        const signer = getUserSigner(record['User ID']);
        const side = getSide(record['Side']);
        const inputAmount = ethers.BigNumber.from(record['Input Amount']);
        const inputUnitPrice = record['Input Unit Price'];
        const orderId = record['Order ID'];
        const maturity = getMaturityForRecord(record['Maturity']);

        console.log(
          `[Processing #${i + 1} for ${maturity}: ${record['Event']}` +
            (Number(orderId) ? ` (OrderId: ${orderId})` : ''),
        );

        if (record['Event'] === 'PreOrderExecuted') {
          if (side === Side.LEND) {
            // LEND: deposit and execute pre-order (ERC20, no value)
            await lendingMarketController
              .connect(signer)
              .depositAndExecutesPreOrder(
                ccy,
                maturity,
                side,
                inputAmount,
                inputUnitPrice,
              );
          } else {
            // BORROW: deposit 1.3x inputAmount, then execute pre-order (ERC20, no value)
            const depositAmount = inputAmount.mul(13).div(10);
            const depositAmountInETH = await currencyController[
              'convert(bytes32,bytes32,uint256)'
            ](ccy, hexETH, depositAmount);
            // await tokenVault.connect(signer).deposit(ccy, depositAmount);
            await tokenVault
              .connect(signer)
              .deposit(hexETH, depositAmountInETH, {
                value: depositAmountInETH,
              });
            await lendingMarketController
              .connect(signer)
              .executePreOrder(
                ccy,
                maturity,
                side,
                inputAmount,
                inputUnitPrice,
              );
          }
        }
      }

      await showOrderBook(10);
    });

    it('Itayose', async function () {
      // Advance time and execute Itayose
      await time.increase(7200);
      for (const maturity of maturities) {
        await lendingMarketController.executeItayoseCall(ccy, maturity);
      }
      await time.increase(3600);

      await showOrderBook(10);
    });

    it('PostItayose', async function () {
      await ethers.provider.send('evm_setAutomine', [false]);
      let currentBlockNumber = '0';

      for (let i = 0; i < postItayose.length; i++) {
        const record = postItayose[i];
        const signer = getUserSigner(record['User ID']);
        const side = getSide(record['Side']);
        const inputAmount = ethers.BigNumber.from(record['Input Amount']);
        const inputUnitPrice = record['Input Unit Price'];
        const orderId = record['Order ID'];
        const blockNumber = record['Block Number'];
        const maturity = getMaturityForRecord(record['Maturity']);

        // Check the total amount
        if (i % 500 === 0 || i === postItayose.length - 1) {
          await showPendingOrderAmounts();
          await showOrderBook(30);
        }

        console.log(
          `Processing #${preItayose.length + i + 1} for ${maturity}: ${
            record['Event']
          }` + (Number(orderId) ? ` (OrderId: ${orderId})` : ''),
        );

        if (record['Event'] === 'OrderExecuted') {
          if (side === Side.LEND) {
            // LEND: deposit and execute order (ERC20, no value)
            await lendingMarketController
              .connect(signer)
              .depositAndExecuteOrder(
                ccy,
                maturity,
                side,
                inputAmount,
                inputUnitPrice,
              );
          } else {
            // BORROW: deposit 1.3x inputAmount, then execute order (ERC20, no value)
            const depositAmount = inputAmount.mul(13).div(10);
            const depositAmountInETH = await currencyController[
              'convert(bytes32,bytes32,uint256)'
            ](ccy, hexETH, depositAmount);

            await tokenVault
              .connect(signer)
              .deposit(hexETH, depositAmountInETH, {
                value: depositAmountInETH,
              });
            await lendingMarketController
              .connect(signer)
              .executeOrder(ccy, maturity, side, inputAmount, inputUnitPrice);
          }
        } else if (record['Event'] === 'OrderCanceled') {
          await lendingMarketController
            .connect(signer)
            .cancelOrder(ccy, maturity, record['Order ID']);
        } else if (record['Event'] === 'PositionUnwound') {
          // Get present value, deposit 1.5x, then unwind
          const { presentValue } = await lendingMarketController.getPosition(
            ccy,
            maturity,
            signer.address,
          );
          const depositAmount = ethers.BigNumber.from(presentValue)
            .mul(15)
            .div(10)
            .abs();
          await tokenVault.connect(signer).deposit(ccy, depositAmount);

          await lendingMarketController
            .connect(signer)
            .unwindPosition(ccy, maturity);
        } else if (record['Event'] === 'LiquidationExecuted') {
          // 1. User withdraws collateral
          const withdrawableCollateral = await tokenVault[
            'getWithdrawableCollateral(bytes32,address)'
          ](hexETH, signer.address);
          if (withdrawableCollateral.isZero()) {
            console.warn(
              `User ${signer.address} has no withdrawable collateral for ${hexETH}`,
            );
          } else {
            await tokenVault
              .connect(signer)
              .withdraw(hexETH, withdrawableCollateral);
          }

          // 2. Change oracle price to trigger liquidation
          const { answer } = await ethToUSDPriceFeed.latestRoundData();
          await ethToUSDPriceFeed.updateAnswer(
            answer.mul(99).div(100), // Set price to 99% of current price
          );

          // 3. Liquidator executes liquidation
          await lendingMarketController
            .connect(liquidator)
            .executeLiquidationCall(ccy, ccy, maturity, signer.address);
        }

        if (currentBlockNumber !== blockNumber) {
          await ethers.provider.send('evm_mine', []);
          currentBlockNumber = blockNumber;
        }
      }
    });

    it('should execute auto-roll for WFIL market', async function () {
      // Advance time to the first maturity
      await time.increaseTo(maturities[0].toString());
      // Rotate order books
      await lendingMarketController.connect(signers[0]).rotateOrderBooks(ccy);

      await showPendingOrderAmounts();
      await showOrderBook(30);
      const addressList = [
        ...signers.map((s) => s.address as string),
        reserveFund.address,
      ];
      await showPositionsPerMaturity(addressList);
    });
  });
});
