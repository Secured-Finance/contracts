import { expect } from 'chai';
import { constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import {
  displayTree,
  verifyBlackHeightConsistency,
} from '../../common/tree-utils';

const OrderStatisticsTree = artifacts.require(
  'OrderStatisticsTreeContract.sol',
);

let ost: Contract;

interface Order {
  unitPrice: string;
  orderId: number;
  amount: number;
}

describe('OrderStatisticsTree - Drop with Root Shift Stress Test', () => {
  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  describe('Stress test: DropLeft + Insert Right (Root shifts right)', () => {
    it('Should handle root shifting right after dropLeft operations', async () => {
      console.log('\n--- Step 1: Insert 5 initial values ---');
      const initialPrices = ['9300', '9200', '9100', '9000', '8900'];
      const allOrders: Order[] = [];
      let orderIdCounter = 1;

      for (let i = 0; i < initialPrices.length; i++) {
        const order: Order = {
          unitPrice: initialPrices[i],
          orderId: orderIdCounter++,
          amount: 100000000,
        };
        allOrders.push(order);

        await ost.insertAmountValue(
          order.unitPrice,
          order.orderId,
          constants.AddressZero,
          order.amount,
        );

        console.log(
          `Inserted: Price ${order.unitPrice}, OrderId ${order.orderId}, Amount ${order.amount}`,
        );
      }

      console.log('\n=== Tree Structure After Initial Inserts ===');

      await displayTree(ost);
      expect(await verifyBlackHeightConsistency(ost)).to.be.true;

      // Verify all initial values exist
      for (const order of allOrders) {
        const exists = await ost.valueExists(order.unitPrice);
        expect(exists).to.be.true;
      }

      console.log('\n--- Step 2: Repeat cycle 5 times ---');
      console.log(
        'Each cycle: dropLeft removes lower prices, then add HIGHER prices',
      );
      console.log('This causes the root to shift progressively to the right');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        console.log(
          `--- Cycle ${cycle}-1: Execute dropLeft to remove 3 values from left ---`,
        );

        const dropAmount = 300000000;
        console.log(`Executing dropLeft with amount: ${dropAmount}`);
        await ost.dropValuesFromFirst(dropAmount, 0, 0);

        console.log(`\nTree after dropLeft in cycle ${cycle}:`);

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        console.log(
          `--- Cycle ${cycle}-2: Add 10 new values with HIGHER prices (right side) ---`,
        );
        const cycleOrderPrices = [
          `${9400 + cycle * 51}`,
          `${9410 + cycle * 51}`,
          `${9420 + cycle * 51}`,
          `${9430 + cycle * 51}`,
          `${9440 + cycle * 51}`,
          `${9450 + cycle * 51}`,
          `${9460 + cycle * 51}`,
          `${9470 + cycle * 51}`,
          `${9480 + cycle * 51}`,
          `${9490 + cycle * 51}`,
        ];

        for (let i = 0; i < cycleOrderPrices.length; i++) {
          const order: Order = {
            unitPrice: cycleOrderPrices[i],
            orderId: orderIdCounter++,
            amount: 100000000,
          };
          allOrders.push(order);

          await ost.insertAmountValue(
            order.unitPrice,
            order.orderId,
            constants.AddressZero,
            order.amount,
          );

          console.log(
            `  Added: Price ${order.unitPrice}, OrderId ${order.orderId}, Amount ${order.amount}`,
          );
        }

        console.log(`\nTree after adding cycle ${cycle} values:`);
        console.log('(Notice how the root shifts to the right)');

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        const remainingOrders = await getAllExistingOrders(allOrders);
        console.log(
          `Remaining values after cycle ${cycle}: ${remainingOrders.length}`,
        );
        console.log(
          `Remaining unitPrices: ${remainingOrders
            .map((o) => o.unitPrice)
            .join(', ')}`,
        );
      }

      console.log('\n=== Final tree state after all cycles ===');
      console.log('Root should have shifted significantly to the right');

      await displayTree(ost);

      console.log('\n--- Step 3: Remove ALL remaining orders one by one ---');

      const actuallyExistingOrders = await getAllExistingOrders(allOrders);
      console.log(`Actually existing orders: ${actuallyExistingOrders.length}`);
      console.log(
        `Actually existing: ${actuallyExistingOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      let removalCount = 0;

      for (const order of actuallyExistingOrders) {
        console.log(
          `\nAttempting removal ${removalCount + 1}/${
            actuallyExistingOrders.length
          }: Price ${order.unitPrice}, OrderId ${order.orderId}`,
        );

        await ost.removeAmountValue(order.unitPrice, order.orderId);
        removalCount++;

        console.log(
          `  ✅ Successfully removed: ${order.unitPrice} (OrderId: ${order.orderId})`,
        );

        console.log(`  Tree state after ${removalCount} removals:`);

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;
      }

      console.log('\n=== Removal Summary ===');
      console.log(`Total orders processed: ${allOrders.length}`);
      console.log(`Successfully removed: ${removalCount}`);
      console.log('\n=== Final Tree State (should be empty) ===');

      await displayTree(ost);
    });
  });

  describe('Stress test: DropRight + Insert Left (Root shifts left)', () => {
    it('Should handle root shifting left after dropRight operations', async () => {
      console.log('\n--- Step 1: Insert 5 initial values ---');
      const initialPrices = ['9100', '9200', '9300', '9400', '9500'];
      const allOrders: Order[] = [];
      let orderIdCounter = 1;

      for (let i = 0; i < initialPrices.length; i++) {
        const order: Order = {
          unitPrice: initialPrices[i],
          orderId: orderIdCounter++,
          amount: 100000000,
        };
        allOrders.push(order);

        await ost.insertAmountValue(
          order.unitPrice,
          order.orderId,
          constants.AddressZero,
          order.amount,
        );

        console.log(
          `Inserted: Price ${order.unitPrice}, OrderId ${order.orderId}, Amount ${order.amount}`,
        );
      }

      console.log('\n=== Tree Structure After Initial Inserts ===');

      await displayTree(ost);
      expect(await verifyBlackHeightConsistency(ost)).to.be.true;

      // Verify all initial values exist
      for (const order of allOrders) {
        const exists = await ost.valueExists(order.unitPrice);
        expect(exists).to.be.true;
      }

      console.log('\n--- Step 2: Repeat cycle 5 times ---');
      console.log(
        'Each cycle: dropRight removes higher prices, then add LOWER prices',
      );
      console.log('This causes the root to shift progressively to the left');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        console.log(
          `--- Cycle ${cycle}-1: Execute dropRight to remove 3 values from right ---`,
        );

        const dropAmount = 300000000;
        console.log(`Executing dropRight with amount: ${dropAmount}`);
        await ost.dropValuesFromLast(dropAmount, 0, 0);

        console.log(`\nTree after dropRight in cycle ${cycle}:`);

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        console.log(
          `--- Cycle ${cycle}-2: Add 10 new values with LOWER prices (left side) ---`,
        );
        const cycleOrderPrices = [
          `${9000 - cycle * 51}`,
          `${8900 - cycle * 51}`,
          `${8800 - cycle * 51}`,
          `${8700 - cycle * 51}`,
          `${8600 - cycle * 51}`,
          `${8500 - cycle * 51}`,
          `${8400 - cycle * 51}`,
          `${8300 - cycle * 51}`,
          `${8200 - cycle * 51}`,
          `${8100 - cycle * 51}`,
        ];

        for (let i = 0; i < cycleOrderPrices.length; i++) {
          const order: Order = {
            unitPrice: cycleOrderPrices[i],
            orderId: orderIdCounter++,
            amount: 100000000,
          };
          allOrders.push(order);

          await ost.insertAmountValue(
            order.unitPrice,
            order.orderId,
            constants.AddressZero,
            order.amount,
          );

          console.log(
            `  Added: Price ${order.unitPrice}, OrderId ${order.orderId}, Amount ${order.amount}`,
          );
        }

        console.log(`\nTree after adding cycle ${cycle} values:`);
        console.log('(Notice how the root shifts to the left)');

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        const remainingOrders = await getAllExistingOrders(allOrders);
        console.log(
          `Remaining values after cycle ${cycle}: ${remainingOrders.length}`,
        );
        console.log(
          `Remaining unitPrices: ${remainingOrders
            .map((o) => o.unitPrice)
            .join(', ')}`,
        );
      }

      console.log('\n=== Final tree state after all cycles ===');
      console.log('Root should have shifted significantly to the left');

      await displayTree(ost);

      console.log('\n--- Step 3: Remove ALL remaining orders one by one ---');

      const actuallyExistingOrders = await getAllExistingOrders(allOrders);
      console.log(`Actually existing orders: ${actuallyExistingOrders.length}`);
      console.log(
        `Actually existing: ${actuallyExistingOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      let removalCount = 0;

      for (const order of actuallyExistingOrders) {
        console.log(
          `\nAttempting removal ${removalCount + 1}/${
            actuallyExistingOrders.length
          }: Price ${order.unitPrice}, OrderId ${order.orderId}`,
        );

        await ost.removeAmountValue(order.unitPrice, order.orderId);
        removalCount++;

        console.log(
          `  ✅ Successfully removed: ${order.unitPrice} (OrderId: ${order.orderId})`,
        );

        console.log(`  Tree state after ${removalCount} removals:`);

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;
      }

      console.log('\n=== Removal Summary ===');
      console.log(`Total orders processed: ${allOrders.length}`);
      console.log(`Successfully removed: ${removalCount}`);
      console.log('\n=== Final Tree State (should be empty) ===');

      await displayTree(ost);
    });
  });

  describe('Stress test: Alternating DropLeft/DropRight with opposite insertions', () => {
    it('Should handle alternating drop operations with root oscillation', async () => {
      console.log(
        '\n--- Step 1: Insert 10 initial values in the middle range ---',
      );
      const initialPrices = [
        '9000',
        '9100',
        '9200',
        '9300',
        '9400',
        '9500',
        '9600',
        '9700',
        '9800',
        '9900',
      ];
      const allOrders: Order[] = [];
      let orderIdCounter = 1;

      for (let i = 0; i < initialPrices.length; i++) {
        const order: Order = {
          unitPrice: initialPrices[i],
          orderId: orderIdCounter++,
          amount: 100000000,
        };
        allOrders.push(order);

        await ost.insertAmountValue(
          order.unitPrice,
          order.orderId,
          constants.AddressZero,
          order.amount,
        );
      }

      console.log('\n=== Tree Structure After Initial Inserts ===');

      await displayTree(ost);
      expect(await verifyBlackHeightConsistency(ost)).to.be.true;

      console.log('\n--- Step 2: Repeat alternating cycles 5 times ---');
      console.log('Odd cycles: dropLeft + insert right (root shifts right)');
      console.log('Even cycles: dropRight + insert left (root shifts left)');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        const isDropLeft = cycle % 2 === 1;

        if (isDropLeft) {
          console.log(
            `--- Cycle ${cycle}-1: Execute dropLeft + Insert Right ---`,
          );

          const dropAmount = 300000000;
          console.log(`Executing dropLeft with amount: ${dropAmount}`);
          await ost.dropValuesFromFirst(dropAmount, 0, 0);

          console.log(`\nTree after dropLeft in cycle ${cycle}:`);

          await displayTree(ost);
          expect(await verifyBlackHeightConsistency(ost)).to.be.true;

          console.log(`Adding higher prices (right side)...`);
          const cycleOrderPrices = [
            `${9910 + cycle}`,
            `${9920 + cycle}`,
            `${9930 + cycle}`,
            `${9940 + cycle}`,
            `${9950 + cycle}`,
          ];

          for (let i = 0; i < cycleOrderPrices.length; i++) {
            const order: Order = {
              unitPrice: cycleOrderPrices[i],
              orderId: orderIdCounter++,
              amount: 100000000,
            };
            allOrders.push(order);

            await ost.insertAmountValue(
              order.unitPrice,
              order.orderId,
              constants.AddressZero,
              order.amount,
            );
          }
        } else {
          console.log(
            `--- Cycle ${cycle}-1: Execute dropRight + Insert Left ---`,
          );

          const dropAmount = 300000000;
          console.log(`Executing dropRight with amount: ${dropAmount}`);
          await ost.dropValuesFromLast(dropAmount, 0, 0);

          console.log(`\nTree after dropRight in cycle ${cycle}:`);

          await displayTree(ost);
          expect(await verifyBlackHeightConsistency(ost)).to.be.true;

          console.log(`Adding lower prices (left side)...`);
          const cycleOrderPrices = [
            `${8900 - cycle}`,
            `${8800 - cycle}`,
            `${8700 - cycle}`,
            `${8600 - cycle}`,
            `${8500 - cycle}`,
          ];

          for (let i = 0; i < cycleOrderPrices.length; i++) {
            const order: Order = {
              unitPrice: cycleOrderPrices[i],
              orderId: orderIdCounter++,
              amount: 100000000,
            };
            allOrders.push(order);

            await ost.insertAmountValue(
              order.unitPrice,
              order.orderId,
              constants.AddressZero,
              order.amount,
            );
          }
        }

        console.log(`\nTree after cycle ${cycle}:`);

        await displayTree(ost);
        expect(await verifyBlackHeightConsistency(ost)).to.be.true;

        const remainingOrders = await getAllExistingOrders(allOrders);
        console.log(
          `Remaining values after cycle ${cycle}: ${remainingOrders.length}`,
        );
      }

      console.log('\n=== Final tree state after all alternating cycles ===');

      await displayTree(ost);

      console.log('\n--- Step 3: Remove ALL remaining orders ---');

      const actuallyExistingOrders = await getAllExistingOrders(allOrders);
      console.log(`Actually existing orders: ${actuallyExistingOrders.length}`);

      let removalCount = 0;

      for (const order of actuallyExistingOrders) {
        await ost.removeAmountValue(order.unitPrice, order.orderId);
        removalCount++;

        if (
          removalCount % 5 === 0 ||
          removalCount === actuallyExistingOrders.length
        ) {
          console.log(
            `  Removed ${removalCount}/${actuallyExistingOrders.length} orders`,
          );
          await displayTree(ost);
          expect(await verifyBlackHeightConsistency(ost)).to.be.true;
        }
      }

      console.log('\n=== Removal Complete ===');
      console.log(`Successfully removed: ${removalCount} orders`);
      console.log('\n=== Final Tree State (should be empty) ===');

      await displayTree(ost);
    });
  });
});

async function getAllExistingOrders(orders: Order[]): Promise<Order[]> {
  const existingOrders: Order[] = [];
  for (const order of orders) {
    const isActive = await ost.isActiveOrderId(order.unitPrice, order.orderId);
    if (isActive) {
      existingOrders.push(order);
    }
  }
  return existingOrders;
}
