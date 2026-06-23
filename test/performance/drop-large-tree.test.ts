import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import {
  countTreeNodes,
  verifyBlackHeightConsistency,
} from '../common/tree-utils';

const OrderStatisticsTree = artifacts.require(
  'OrderStatisticsTreeContract.sol',
);

let ost: Contract;

interface Order {
  unitPrice: string;
  orderId: number;
  amount: number;
}

describe('Performance Test: OrderStatisticsTree - Large Tree Drop Test', () => {
  const DROP_COUNTS = [1, 10, 50, 100, 500, 1000, 1500];
  const TREE_SIZE = 10000;
  const REPEAT_COUNT = 3;

  // Shared results for comprehensive summary
  const allResults: Record<string, Record<string, number>> = {};

  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  const createOrders = (ascending: boolean, count: number): Order[] => {
    const orders: Order[] = [];
    for (let i = 0; i < count; i++) {
      orders.push({
        unitPrice: ascending ? String(i + 1) : String(count - i),
        orderId: i + 1,
        amount: 100000000,
      });
    }
    return orders;
  };

  const insertOrders = async (orders: Order[]) => {
    process.stdout.write('Inserted: 0');

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      process.stdout.write('\r\x1b[K');
      process.stdout.write(`Inserted: ${i + 1}/${orders.length}`);

      await ost.insertAmountValue(
        order.unitPrice,
        order.orderId,
        constants.AddressZero,
        order.amount,
      );
    }

    process.stdout.write('\r\x1b[K');
  };

  const getOrdinalSuffix = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  const runDropLeftTest = async (
    insertionOrder: 'ascending' | 'descending',
    dropCount: number,
  ): Promise<{ gasCosts: number[]; minGas: number; maxGas: number }> => {
    console.log(`\n=== DropLeft Test ===`);
    console.log(`Insertion order: ${insertionOrder}`);
    console.log(`Tree size: ${TREE_SIZE}`);
    console.log(`Drop count: ${dropCount}`);

    // Create and insert orders
    const orders = createOrders(insertionOrder === 'ascending', TREE_SIZE);
    console.log(`\nInserting ${TREE_SIZE} orders...`);
    await insertOrders(orders);

    // Verify tree consistency
    expect(await verifyBlackHeightConsistency(ost)).to.be.true;

    const gasCosts: number[] = [];

    // Execute dropLeft and re-insert REPEAT_COUNT times
    for (let i = 0; i < REPEAT_COUNT; i++) {
      // Execute dropLeft
      const dropAmount = BigNumber.from(dropCount).mul(100000000);
      console.log(
        `\n[${
          i + 1
        }/${REPEAT_COUNT}] Executing dropLeft with amount: ${dropAmount.toString()}`,
      );

      const { receipt } = await ost.dropValuesFromFirst(dropAmount, 0, 0);
      gasCosts.push(receipt.gasUsed);

      console.log(`Gas used: ${receipt.gasUsed}`);

      // Verify tree consistency after drop
      expect(await verifyBlackHeightConsistency(ost)).to.be.true;

      // Check remaining node count
      const remainingCount = await countTreeNodes(ost);
      expect(remainingCount).to.equal(TREE_SIZE - dropCount);

      // Re-insert orders except for the last iteration
      if (i < REPEAT_COUNT - 1) {
        console.log(`Re-inserting ${dropCount} orders...`);
        // DropLeft removes the smallest unitPrice nodes
        // For ascending (1→TREE_SIZE): smallest are orders[0] to orders[dropCount-1]
        // For descending (TREE_SIZE→1): smallest are orders[TREE_SIZE-dropCount] to orders[TREE_SIZE-1]
        const droppedOrders =
          insertionOrder === 'ascending'
            ? orders.slice(0, dropCount)
            : orders.slice(TREE_SIZE - dropCount, TREE_SIZE);
        await insertOrders(droppedOrders);

        // Verify tree consistency after re-insertion
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        const restoredCount = await countTreeNodes(ost);
        expect(restoredCount).to.equal(TREE_SIZE);
      }
    }

    const minGas = Math.min(...gasCosts);
    const maxGas = Math.max(...gasCosts);

    return { gasCosts, minGas, maxGas };
  };

  const runDropRightTest = async (
    insertionOrder: 'ascending' | 'descending',
    dropCount: number,
  ): Promise<{ gasCosts: number[]; minGas: number; maxGas: number }> => {
    console.log(`\n=== DropRight Test ===`);
    console.log(`Insertion order: ${insertionOrder}`);
    console.log(`Tree size: ${TREE_SIZE}`);
    console.log(`Drop count: ${dropCount}`);

    // Create and insert orders
    const orders = createOrders(insertionOrder === 'ascending', TREE_SIZE);
    console.log(`\nInserting ${TREE_SIZE} orders...`);
    await insertOrders(orders);

    // Verify tree consistency
    expect(await verifyBlackHeightConsistency(ost)).to.be.true;

    const gasCosts: number[] = [];

    // Execute dropRight and re-insert REPEAT_COUNT times
    for (let i = 0; i < REPEAT_COUNT; i++) {
      // Execute dropRight
      const dropAmount = dropCount * 100000000;
      console.log(
        `\n[${
          i + 1
        }/${REPEAT_COUNT}] Executing dropRight with amount: ${dropAmount}`,
      );

      const { receipt } = await ost.dropValuesFromLast(dropAmount, 0, 0);
      gasCosts.push(receipt.gasUsed);

      console.log(`Gas used: ${receipt.gasUsed}`);

      // Verify tree consistency after drop
      expect(await verifyBlackHeightConsistency(ost)).to.be.true;

      // Check remaining node count
      const remainingCount = await countTreeNodes(ost);
      expect(remainingCount).to.equal(TREE_SIZE - dropCount);

      // Re-insert orders except for the last iteration
      if (i < REPEAT_COUNT - 1) {
        console.log(`Re-inserting ${dropCount} orders...`);
        // DropRight removes the largest unitPrice nodes
        // For ascending (1→TREE_SIZE): largest are orders[TREE_SIZE-dropCount] to orders[TREE_SIZE-1]
        // For descending (TREE_SIZE→1): largest are orders[0] to orders[dropCount-1]
        const droppedOrders =
          insertionOrder === 'ascending'
            ? orders.slice(TREE_SIZE - dropCount, TREE_SIZE)
            : orders.slice(0, dropCount);
        await insertOrders(droppedOrders);

        // Verify tree consistency after re-insertion
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        const restoredCount = await countTreeNodes(ost);
        expect(restoredCount).to.equal(TREE_SIZE);
      }
    }

    const minGas = Math.min(...gasCosts);
    const maxGas = Math.max(...gasCosts);

    return { gasCosts, minGas, maxGas };
  };

  describe('DropLeft - Ascending insertion (unitPrice 1→10000)', () => {
    const localResults: Record<string, { min: string; max: string }> = {};

    for (const dropCount of DROP_COUNTS) {
      it(`Should drop ${dropCount} nodes from left`, async () => {
        const { gasCosts, minGas, maxGas } = await runDropLeftTest(
          'ascending',
          dropCount,
        );

        // Find indices of min and max
        const minIndex = gasCosts.indexOf(minGas);
        const maxIndex = gasCosts.indexOf(maxGas);

        localResults[`Drop ${dropCount}`] = {
          min: `${minGas} (${minIndex + 1}${getOrdinalSuffix(minIndex + 1)})`,
          max: `${maxGas} (${maxIndex + 1}${getOrdinalSuffix(maxIndex + 1)})`,
        };

        if (!allResults['DropLeft-Asc']) {
          allResults['DropLeft-Asc'] = {};
        }
        allResults['DropLeft-Asc'][`Gas Cost(${dropCount})`] = maxGas;
      }).timeout(3600000); // 60 minutes timeout
    }

    after(() => {
      console.log('\n=== DropLeft - Ascending: Gas Cost Summary ===');
      console.table(localResults);
    });
  });

  describe('DropLeft - Descending insertion (unitPrice 10000→1)', () => {
    const localResults: Record<string, { min: string; max: string }> = {};

    for (const dropCount of DROP_COUNTS) {
      it(`Should drop ${dropCount} nodes from left`, async () => {
        const { gasCosts, minGas, maxGas } = await runDropLeftTest(
          'descending',
          dropCount,
        );

        // Find indices of min and max
        const minIndex = gasCosts.indexOf(minGas);
        const maxIndex = gasCosts.indexOf(maxGas);

        localResults[`Drop ${dropCount}`] = {
          min: `${minGas} (${minIndex + 1}${getOrdinalSuffix(minIndex + 1)})`,
          max: `${maxGas} (${maxIndex + 1}${getOrdinalSuffix(maxIndex + 1)})`,
        };

        if (!allResults['DropLeft-Desc']) {
          allResults['DropLeft-Desc'] = {};
        }
        allResults['DropLeft-Desc'][`Gas Cost(${dropCount})`] = maxGas;
      }).timeout(3600000); // 60 minutes timeout
    }

    after(() => {
      console.log('\n=== DropLeft - Descending: Gas Cost Summary ===');
      console.table(localResults);
    });
  });

  describe('DropRight - Ascending insertion (unitPrice 1→10000)', () => {
    const localResults: Record<string, { min: string; max: string }> = {};

    for (const dropCount of DROP_COUNTS) {
      it(`Should drop ${dropCount} nodes from right`, async () => {
        const { gasCosts, minGas, maxGas } = await runDropRightTest(
          'ascending',
          dropCount,
        );

        // Find indices of min and max
        const minIndex = gasCosts.indexOf(minGas);
        const maxIndex = gasCosts.indexOf(maxGas);

        localResults[`Drop ${dropCount}`] = {
          min: `${minGas} (${minIndex + 1}${getOrdinalSuffix(minIndex + 1)})`,
          max: `${maxGas} (${maxIndex + 1}${getOrdinalSuffix(maxIndex + 1)})`,
        };

        if (!allResults['DropRight-Asc']) {
          allResults['DropRight-Asc'] = {};
        }
        allResults['DropRight-Asc'][`Gas Cost(${dropCount})`] = maxGas;
      }).timeout(3600000); // 60 minutes timeout
    }

    after(() => {
      console.log('\n=== DropRight - Ascending: Gas Cost Summary ===');
      console.table(localResults);
    });
  });

  describe('DropRight - Descending insertion (unitPrice 10000→1)', () => {
    const localResults: Record<string, { min: string; max: string }> = {};

    for (const dropCount of DROP_COUNTS) {
      it(`Should drop ${dropCount} nodes from right`, async () => {
        const { gasCosts, minGas, maxGas } = await runDropRightTest(
          'descending',
          dropCount,
        );

        // Find indices of min and max
        const minIndex = gasCosts.indexOf(minGas);
        const maxIndex = gasCosts.indexOf(maxGas);

        localResults[`Drop ${dropCount}`] = {
          min: `${minGas} (${minIndex + 1}${getOrdinalSuffix(minIndex + 1)})`,
          max: `${maxGas} (${maxIndex + 1}${getOrdinalSuffix(maxIndex + 1)})`,
        };

        if (!allResults['DropRight-Desc']) {
          allResults['DropRight-Desc'] = {};
        }
        allResults['DropRight-Desc'][`Gas Cost(${dropCount})`] = maxGas;
      }).timeout(3600000); // 60 minutes timeout
    }

    after(() => {
      console.log('\n=== DropRight - Descending: Gas Cost Summary ===');
      console.table(localResults);
    });
  });

  describe('Gas Cost Summary', () => {
    it('Should display comprehensive gas cost summary', () => {
      console.log('\n\n=== FINAL GAS COST SUMMARY ===\n');
      console.table(allResults);
    });
  });
});
