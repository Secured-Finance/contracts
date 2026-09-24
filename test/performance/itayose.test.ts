import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers, network } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';
import { progressIndicator } from '../common/performance-helpers';

type InitializationOptions = {
  borrowAmountPerOrder?: BigNumber;
  lendAmountPerOrder?: BigNumber;
  gasLimit?: number;
};

type SideValue = (typeof Side)[keyof typeof Side];

describe('Performance Test: Itayose', () => {
  const INITIALIZATION_NODE_COUNTS = [1, 10, 100, 1000];
  const EVERY_OTHER_NODE_COUNTS = [100, 501];
  const SETTLEMENT_NODE_COUNTS = [1, 10, 100, 500];
  const MAX_ORDERS_PER_USER = 20;
  const ORDERS_PER_CHUNK = 100;
  const MAX_ITAYOSE_PRICE_LEVELS_PER_CALL = 500;
  const COMPOSITE_SETTLEMENT_CHUNK_COUNT = 1000;
  const ORDER_AMOUNT = BigNumber.from('100000000000000');
  const PROFILING_GAS_LIMIT = 60_000_000;
  const EIP_7825_TRANSACTION_GAS_LIMIT = 2 ** 24;

  const initializationResults: Record<string, number> = {};
  const settlementResults: Record<string, number> = {};

  let signers: SignerWithAddress[];
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarket: Contract;
  let maturity: BigNumber;
  let orderBookId: BigNumber;
  let openingDate: number;
  let snapshotId: string;
  let nextSignerIndex: number;

  before(async () => {
    await network.provider.send('hardhat_reset');
    signers = await ethers.getSigners();
    ({ tokenVault, lendingMarketController } = await deployContracts());

    await tokenVault.updateCurrency(hexETH, true);
    // Keep the converted reference low enough to retain the full 2001-price pre-order range.
    await lendingMarketController.updateMinDebtUnitPrice(hexETH, 1);
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await network.provider.send('evm_snapshot');
    nextSignerIndex = 1;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const preOpeningDate = timestamp + 60 * 60;
    openingDate = preOpeningDate + 7 * 24 * 60 * 60;

    await lendingMarketController.createOrderBook(
      hexETH,
      openingDate,
      preOpeningDate,
    );
    [maturity] = await lendingMarketController.getMaturities(hexETH);
    orderBookId = await lendingMarketController.getOrderBookId(
      hexETH,
      maturity,
    );
    lendingMarket = await lendingMarketController
      .getLendingMarket(hexETH)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    await time.increaseTo(preOpeningDate);
  });

  const placePreOrders = async (
    side: SideValue,
    unitPrices: number[],
    amountPerOrder: BigNumber,
  ) => {
    const label = `Placing ${side === Side.LEND ? 'LEND' : 'BORROW'} orders`;
    progressIndicator.start(label);

    for (let offset = 0; offset < unitPrices.length; ) {
      const user = signers[nextSignerIndex++];
      const userOrderCount = Math.min(
        MAX_ORDERS_PER_USER,
        unitPrices.length - offset,
      );
      const userOrderAmount = amountPerOrder.mul(userOrderCount);
      const depositAmount =
        side === Side.BORROW ? userOrderAmount.mul(3) : userOrderAmount;

      await tokenVault.connect(user).deposit(hexETH, depositAmount, {
        value: depositAmount,
      });

      for (let i = 0; i < userOrderCount; i++) {
        await lendingMarketController
          .connect(user)
          .executePreOrder(
            hexETH,
            maturity,
            side,
            amountPerOrder,
            unitPrices[offset + i],
          );

        const completedOrderCount = offset + i + 1;
        if (
          completedOrderCount % MAX_ORDERS_PER_USER === 0 ||
          completedOrderCount === unitPrices.length
        ) {
          progressIndicator.update(
            label,
            completedOrderCount,
            unitPrices.length,
          );
        }
      }

      offset += userOrderCount;
    }

    progressIndicator.clear();
  };

  const placePreOrdersDirectly = async (
    side: SideValue,
    unitPrice: number,
    orderCount: number,
    amountPerOrder: BigNumber,
  ) => {
    const controllerAddress = lendingMarketController.address;
    const label = `Placing ${orderCount} orders at ${unitPrice}`;

    await network.provider.send('hardhat_impersonateAccount', [
      controllerAddress,
    ]);
    await network.provider.send('hardhat_setBalance', [
      controllerAddress,
      ethers.utils.hexValue(ethers.utils.parseEther('1000000')),
    ]);
    const controllerSigner = await ethers.getSigner(controllerAddress);

    progressIndicator.start(label);

    try {
      for (let i = 0; i < orderCount; i++) {
        // Use at most 20 orders per maker to preserve the production user-level limit.
        const makerIndex = Math.floor(i / MAX_ORDERS_PER_USER) + 1_000_000;
        const maker = ethers.utils.getAddress(
          ethers.utils.hexZeroPad(BigNumber.from(makerIndex).toHexString(), 20),
        );

        await lendingMarket
          .connect(controllerSigner)
          .executePreOrder(orderBookId, side, maker, amountPerOrder, unitPrice);

        const completedOrderCount = i + 1;
        if (
          completedOrderCount % ORDERS_PER_CHUNK === 0 ||
          completedOrderCount === orderCount
        ) {
          progressIndicator.update(label, completedOrderCount, orderCount);
        }
      }
    } finally {
      progressIndicator.clear();
      await network.provider.send('hardhat_stopImpersonatingAccount', [
        controllerAddress,
      ]);
    }
  };

  const getCrossingUnitPrices = async (
    nodeCount: number,
    unitPriceInterval = 1,
  ) => {
    const range = await lendingMarketController.getOrderUnitPriceRange(
      hexETH,
      maturity,
    );
    const minUnitPrice = range.minBorrowUnitPrice.toNumber();
    const maxUnitPrice = range.maxLendUnitPrice.toNumber();
    const borrowUnitPrices = Array.from(
      { length: nodeCount },
      (_, i) => minUnitPrice + i * unitPriceInterval,
    );
    const lendUnitPrices = Array.from(
      { length: nodeCount },
      (_, i) =>
        maxUnitPrice -
        (nodeCount - 1) * unitPriceInterval +
        i * unitPriceInterval,
    );

    expect(borrowUnitPrices[borrowUnitPrices.length - 1]).to.be.lte(
      lendUnitPrices[0],
    );

    return { borrowUnitPrices, lendUnitPrices };
  };

  const getGroupedCrossingUnitPrices = async (
    consecutivePriceCount: number,
  ) => {
    const range = await lendingMarketController.getOrderUnitPriceRange(
      hexETH,
      maturity,
    );
    const minUnitPrice = range.minBorrowUnitPrice.toNumber();
    const maxUnitPrice = range.maxLendUnitPrice.toNumber();
    const halfRange = Math.floor((maxUnitPrice - minUnitPrice) / 2);
    const groupSize = consecutivePriceCount + 1;
    const offsets = Array.from({ length: halfRange + 1 }, (_, i) => i).filter(
      (offset) => offset % groupSize < consecutivePriceCount,
    );
    const borrowUnitPrices = offsets.map((offset) => minUnitPrice + offset);
    const lendUnitPrices = offsets
      .map((offset) => maxUnitPrice - offset)
      .reverse();

    expect(borrowUnitPrices[borrowUnitPrices.length - 1]).to.be.lte(
      lendUnitPrices[0],
    );

    return { borrowUnitPrices, lendUnitPrices };
  };

  const reorderByAlternatingExtremes = (unitPrices: number[]) => {
    const reorderedUnitPrices: number[] = [];
    let lowerIndex = 0;
    let upperIndex = unitPrices.length - 1;

    while (lowerIndex <= upperIndex) {
      reorderedUnitPrices.push(unitPrices[lowerIndex++]);
      if (lowerIndex <= upperIndex) {
        reorderedUnitPrices.push(unitPrices[upperIndex--]);
      }
    }

    return reorderedUnitPrices;
  };

  const measureInitialization = async (
    borrowUnitPrices: number[],
    lendUnitPrices: number[],
    resultLabel: string,
    {
      borrowAmountPerOrder = ORDER_AMOUNT,
      lendAmountPerOrder = ORDER_AMOUNT,
      gasLimit = PROFILING_GAS_LIMIT,
    }: InitializationOptions = {},
  ) => {
    expect(borrowUnitPrices.length).to.equal(lendUnitPrices.length);
    const totalBorrowAmount = borrowAmountPerOrder.mul(borrowUnitPrices.length);
    const totalLendAmount = lendAmountPerOrder.mul(lendUnitPrices.length);
    const totalOffsetAmount = totalBorrowAmount.lt(totalLendAmount)
      ? totalBorrowAmount
      : totalLendAmount;

    await placePreOrders(Side.BORROW, borrowUnitPrices, borrowAmountPerOrder);
    await placePreOrders(Side.LEND, lendUnitPrices, lendAmountPerOrder);
    await time.increaseTo(openingDate);

    // An uninitialized process makes this step execute only initialization.
    const tx = await lendingMarketController.executeItayoseStep(
      hexETH,
      maturity,
      { gasLimit },
    );
    const receipt = await tx.wait();
    initializationResults[resultLabel] = receipt.gasUsed.toNumber();
    expect(receipt.gasUsed).to.be.lte(EIP_7825_TRANSACTION_GAS_LIMIT);

    const status = await lendingMarketController.getItayoseProcessStatus(
      hexETH,
      maturity,
    );
    expect(status.isInProgress).to.equal(true);
    expect(status.isReady).to.equal(false);
    expect(status.totalOffsetAmount).to.equal(totalOffsetAmount);
    expect(status.remainingBorrowOffsetAmount).to.equal(totalOffsetAmount);
    expect(status.remainingLendOffsetAmount).to.equal(totalOffsetAmount);
  };

  describe('_initializeItayose via executeItayoseStep', () => {
    for (const nodeCount of INITIALIZATION_NODE_COUNTS) {
      it(`initializes from ${nodeCount} unit prices per side`, async () => {
        const { borrowUnitPrices, lendUnitPrices } =
          await getCrossingUnitPrices(nodeCount);

        await measureInitialization(
          borrowUnitPrices,
          lendUnitPrices,
          `${nodeCount} per side (${nodeCount * 2} total)`,
        );
      });
    }

    for (const nodeCount of EVERY_OTHER_NODE_COUNTS) {
      it(`initializes from every other unit price with ${nodeCount} nodes per side`, async () => {
        const { borrowUnitPrices, lendUnitPrices } =
          await getCrossingUnitPrices(nodeCount, 2);

        await measureInitialization(
          borrowUnitPrices,
          lendUnitPrices,
          `Every other price (${nodeCount} per side, ${nodeCount * 2} total)`,
          {
            gasLimit:
              nodeCount === 501
                ? EIP_7825_TRANSACTION_GAS_LIMIT
                : PROFILING_GAS_LIMIT,
          },
        );
      });
    }

    it('initializes from every other unit price with asymmetric order amounts', async () => {
      const { borrowUnitPrices, lendUnitPrices } = await getCrossingUnitPrices(
        501,
        2,
      );

      // A 1-wei difference avoids equal remaining amounts, making one side advance at a time.
      await measureInitialization(
        borrowUnitPrices,
        lendUnitPrices,
        'Every other price with asymmetric amounts (501 per side, 1002 total)',
        {
          borrowAmountPerOrder: ORDER_AMOUNT,
          lendAmountPerOrder: ORDER_AMOUNT.add(1),
          gasLimit: EIP_7825_TRANSACTION_GAS_LIMIT,
        },
      );
    });

    it('initializes from every other unit price inserted by alternating extremes', async () => {
      const { borrowUnitPrices, lendUnitPrices } = await getCrossingUnitPrices(
        501,
        2,
      );

      await measureInitialization(
        reorderByAlternatingExtremes(borrowUnitPrices),
        reorderByAlternatingExtremes(lendUnitPrices),
        'Every other price with alternating-extremes insertion (501 per side, 1002 total)',
        { gasLimit: EIP_7825_TRANSACTION_GAS_LIMIT },
      );
    });

    it('initializes from two consecutive unit prices followed by one empty price', async () => {
      const { borrowUnitPrices, lendUnitPrices } =
        await getGroupedCrossingUnitPrices(2);

      await measureInitialization(
        borrowUnitPrices,
        lendUnitPrices,
        `2 consecutive + 1 empty (${borrowUnitPrices.length} per side, ${
          borrowUnitPrices.length * 2
        } total)`,
      );
    });
  });

  describe('_executeItayoseSettlement via executeItayoseStep', () => {
    for (const nodeCount of SETTLEMENT_NODE_COUNTS) {
      it(`settles ${nodeCount} BORROW unit prices in one step`, async () => {
        const { borrowUnitPrices, lendUnitPrices } =
          await getCrossingUnitPrices(nodeCount);
        const totalAmount = ORDER_AMOUNT.mul(nodeCount);

        await placePreOrders(Side.BORROW, borrowUnitPrices, ORDER_AMOUNT);
        await placePreOrders(
          Side.LEND,
          [lendUnitPrices[lendUnitPrices.length - 1]],
          totalAmount,
        );
        await time.increaseTo(openingDate);

        // The first step only initializes the process; measure the following settlement step.
        await lendingMarketController.executeItayoseStep(hexETH, maturity, {
          gasLimit: PROFILING_GAS_LIMIT,
        });
        const tx = await lendingMarketController.executeItayoseStep(
          hexETH,
          maturity,
          { gasLimit: PROFILING_GAS_LIMIT },
        );
        const receipt = await tx.wait();

        settlementResults[`${nodeCount} BORROW unit prices`] =
          receipt.gasUsed.toNumber();

        const status = await lendingMarketController.getItayoseProcessStatus(
          hexETH,
          maturity,
        );
        expect(status.remainingBorrowOffsetAmount).to.equal(0);
        expect(status.remainingLendOffsetAmount).to.equal(totalAmount);

        const { unitPrices } = await lendingMarket.getBorrowOrderBook(
          orderBookId,
          0,
          nodeCount + 1,
        );
        expect(unitPrices.filter((unitPrice: BigNumber) => !unitPrice.isZero()))
          .to.be.empty;
      });
    }

    it(`settles ${MAX_ITAYOSE_PRICE_LEVELS_PER_CALL} price levels with ${COMPOSITE_SETTLEMENT_CHUNK_COUNT} chunks at the boundary price`, async () => {
      const { borrowUnitPrices, lendUnitPrices } = await getCrossingUnitPrices(
        MAX_ITAYOSE_PRICE_LEVELS_PER_CALL,
        2,
      );
      const boundaryUnitPrice = borrowUnitPrices[borrowUnitPrices.length - 1];
      const fullyFilledBorrowUnitPrices = borrowUnitPrices.slice(0, -1);
      const boundaryOrderCount =
        COMPOSITE_SETTLEMENT_CHUNK_COUNT * ORDERS_PER_CHUNK;
      const filledBoundaryOrderCount = boundaryOrderCount - 1;
      const totalOffsetAmount = ORDER_AMOUNT.mul(
        fullyFilledBorrowUnitPrices.length + filledBoundaryOrderCount,
      );

      await placePreOrders(
        Side.BORROW,
        fullyFilledBorrowUnitPrices,
        ORDER_AMOUNT,
      );
      await placePreOrdersDirectly(
        Side.BORROW,
        boundaryUnitPrice,
        boundaryOrderCount,
        ORDER_AMOUNT,
      );
      await placePreOrders(
        Side.LEND,
        [lendUnitPrices[lendUnitPrices.length - 1]],
        totalOffsetAmount,
      );
      await time.increaseTo(openingDate);

      // Initialize separately so this transaction measures only the composite settlement step.
      await lendingMarketController.executeItayoseStep(hexETH, maturity, {
        gasLimit: PROFILING_GAS_LIMIT,
      });
      const tx = await lendingMarketController.executeItayoseStep(
        hexETH,
        maturity,
        { gasLimit: PROFILING_GAS_LIMIT },
      );
      const receipt = await tx.wait();

      settlementResults[
        `${MAX_ITAYOSE_PRICE_LEVELS_PER_CALL} prices + ${COMPOSITE_SETTLEMENT_CHUNK_COUNT} boundary chunks`
      ] = receipt.gasUsed.toNumber();
      expect(receipt.gasUsed).to.be.lte(EIP_7825_TRANSACTION_GAS_LIMIT);

      const status = await lendingMarketController.getItayoseProcessStatus(
        hexETH,
        maturity,
      );
      expect(status.remainingBorrowOffsetAmount).to.equal(0);
      expect(status.remainingLendOffsetAmount).to.equal(totalOffsetAmount);

      const { unitPrices, amounts, quantities } =
        await lendingMarket.getBorrowOrderBook(orderBookId, 0, 2);
      expect(unitPrices[0]).to.equal(boundaryUnitPrice);
      expect(amounts[0]).to.equal(ORDER_AMOUNT);
      expect(quantities[0]).to.equal(1);
      expect(unitPrices[1]).to.equal(0);
    });
  });

  after(() => {
    console.log('\n_initializeItayose gas costs');
    console.table(initializationResults);
    console.log('\n_executeItayoseSettlement gas costs');
    console.table(settlementResults);
  });
});
