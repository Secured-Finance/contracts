import { expect } from 'chai';
import { constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';

const OrderStatisticsTree = artifacts.require(
  'OrderStatisticsTreeContract.sol',
);

let ost: Contract;

interface Order {
  unitPrice: string;
  orderId: number;
  amount: number;
}

describe('OrderStatisticsTree - Drop + Remove Stress Test', () => {
  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  describe('Stress test: Insert + Multiple DropLeft + Remove All', () => {
    it('Should removal all orders after dropLeft operations', async () => {
      console.log('\n--- Step 1: Insert 5 initial values ---');
      const initialPrices = ['9500', '9400', '9300', '9200', '9100'];
      const allOrders: Order[] = [];
      let orderIdCounter = 1;
      const expectedRemainingPrices: string[] = initialPrices;

      for (let i = 0; i < initialPrices.length; i++) {
        const order: Order = {
          unitPrice: initialPrices[i],
          orderId: orderIdCounter++,
          amount: 100000000, // Same amount for all orders to make dropLeft behavior more predictable
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
      await printTreeStructure();

      // Verify all initial values exist
      for (const order of allOrders) {
        const exists = await ost.valueExists(order.unitPrice);
        expect(exists).to.be.true;
      }

      console.log('\n--- Step 2: Repeat cycle 5 times ---');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        console.log(
          `--- Cycle ${cycle}-1: Add 5 new values with lower prices ---`,
        );
        const cycleOrderPrices = [
          `${9000 - cycle * 10}`, // 8990, 8980, 9870, ...
          `${8900 - cycle * 10}`, // 8890, 8880, 8870, ...
          `${8800 - cycle * 10}`, // 8790, 8780, 8770, ...
          `${8700 - cycle * 10}`, // 8690, 8680, 8670, ...
          `${8600 - cycle * 10}`, // 8590, 8580, 8570, ...
        ];

        for (let i = 0; i < cycleOrderPrices.length; i++) {
          const order: Order = {
            unitPrice: cycleOrderPrices[i],
            orderId: orderIdCounter++,
            amount: 100000000, // Same amount for consistency
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
        await printTreeStructure();

        console.log(
          `--- Cycle ${cycle}-2: Execute dropLeft to remove 3 values ---`,
        );

        // Calculate amount to drop approximately 3 values from the left (lowest prices)
        // With 100M amount per order, 300M should remove exactly 3 orders
        const dropAmount = 300000000; // Amount that should remove exactly 3 orders

        console.log(`Executing dropLeft with amount: ${dropAmount}`);
        await ost.dropValuesFromFirst(dropAmount, 0, 0);

        console.log(`\nTree after dropLeft in cycle ${cycle}:`);
        await printTreeStructure();

        // Check which values still exist after dropLeft
        expectedRemainingPrices.push(...cycleOrderPrices.slice(0, 2));
        const remainingOrders = await getAllExistingOrders(allOrders);
        console.log(
          `Remaining values after dropLeft: ${remainingOrders.length}`,
        );
        console.log(
          `Remaining unitPrices: ${remainingOrders
            .map((o) => o.unitPrice)
            .join(', ')}`,
        );

        expect(remainingOrders.length).to.equal(expectedRemainingPrices.length);
        for (const order of remainingOrders) {
          expect(expectedRemainingPrices).to.include(order.unitPrice);
        }
      }

      console.log('\n=== Final tree state after all cycles ===');
      await printTreeStructure();

      console.log(
        '\n--- Step 3: Attempt to remove ALL orders (regardless of current existence) ---',
      );

      // Try to remove ALL orders we've tracked, not just the ones that currently exist
      // This is more likely to trigger the bug where dropLeft corrupts internal state
      console.log(`Total orders to attempt removal: ${allOrders.length}`);
      console.log(
        `Orders to attempt removal: ${allOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      let removalCount = 0;

      // Check what actually exists before we start removing
      const actuallyExistingOrders = await getAllExistingOrders(allOrders);
      console.log(`Actually existing orders: ${actuallyExistingOrders.length}`);
      console.log(
        `Actually existing: ${actuallyExistingOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      for (const order of actuallyExistingOrders) {
        console.log(
          `\nAttempting removal ${removalCount + 1}/${
            allOrders.length
          }: Price ${order.unitPrice}, OrderId ${order.orderId}`,
        );

        await ost.removeAmountValue(order.unitPrice, order.orderId);
        removalCount++;

        console.log(
          `  ✅ Successfully removed: ${order.unitPrice} (OrderId: ${order.orderId})`,
        );

        console.log(`  Tree state after ${removalCount} removals:`);
        await printTreeStructure();
      }

      console.log('\n=== Removal Summary ===');
      console.log(`Total orders processed: ${allOrders.length}`);
      console.log(`Successfully removed: ${removalCount}`);
      console.log('\n=== Final Tree State ===');
      await printTreeStructure();
    });
  });

  describe('Stress test: Insert + Multiple DropRight + Remove All', () => {
    it('Should removal all orders after dropRight operations', async () => {
      console.log('\n--- Step 1: Insert 5 initial values ---');
      const initialPrices = ['9000', '9100', '9200', '9300', '9400'];
      const allOrders: Order[] = [];
      let orderIdCounter = 1;
      const expectedRemainingPrices: string[] = initialPrices;

      for (let i = 0; i < initialPrices.length; i++) {
        const order: Order = {
          unitPrice: initialPrices[i],
          orderId: orderIdCounter++,
          amount: 100000000, // Same amount for all orders to make dropRight behavior more predictable
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
      await printTreeStructure();

      // Verify all initial values exist
      for (const order of allOrders) {
        const exists = await ost.valueExists(order.unitPrice);
        expect(exists).to.be.true;
      }

      console.log('\n--- Step 2: Repeat cycle 5 times ---');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        console.log(
          `--- Cycle ${cycle}-1: Add 5 new values with higher prices ---`,
        );
        const cycleOrderPrices = [
          `${9500 + cycle * 10}`, // 9610, 9620, 9630, ...
          `${9600 + cycle * 10}`, // 9710, 9720, 9730, ...
          `${9700 + cycle * 10}`, // 9810, 9820, 9830, ...
          `${9800 + cycle * 10}`, // 9910, 9920, 9930, ...
          `${9900 + cycle * 10}`, // 10010, 10020, 10030, ...
        ];

        for (let i = 0; i < cycleOrderPrices.length; i++) {
          const order: Order = {
            unitPrice: cycleOrderPrices[i],
            orderId: orderIdCounter++,
            amount: 100000000, // Same amount for consistency
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
        await printTreeStructure();

        console.log(
          `--- Cycle ${cycle}-2: Execute dropRight to remove 3 values ---`,
        );

        // Calculate amount to drop approximately 3 values from the right (highest prices)
        // With 100M amount per order, 300M should remove exactly 3 orders
        const dropAmount = 300000000; // Amount that should remove exactly 3 orders

        console.log(`Executing dropRight with amount: ${dropAmount}`);
        await ost.dropValuesFromLast(dropAmount, 0, 0);

        console.log(`\nTree after dropRight in cycle ${cycle}:`);
        await printTreeStructure();

        // Check which values still exist after dropRight
        expectedRemainingPrices.push(...cycleOrderPrices.slice(0, 2));
        const remainingOrders = await getAllExistingOrders(allOrders);
        console.log(
          `Remaining values after dropRight: ${remainingOrders.length}`,
        );
        console.log(
          `Remaining unitPrices: ${remainingOrders
            .map((o) => o.unitPrice)
            .join(', ')}`,
        );

        expect(remainingOrders.length).to.equal(expectedRemainingPrices.length);
        for (const order of remainingOrders) {
          expect(expectedRemainingPrices).to.include(order.unitPrice);
        }
      }

      console.log('\n=== Final tree state after all cycles ===');
      await printTreeStructure();

      console.log(
        '\n--- Step 3: Attempt to remove ALL orders (regardless of current existence) ---',
      );

      console.log(`Total orders to attempt removal: ${allOrders.length}`);
      console.log(
        `Orders to attempt removal: ${allOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      let removalCount = 0;

      // Check what actually exists before we start removing
      const actuallyExistingOrders = await getAllExistingOrders(allOrders);
      console.log(`Actually existing orders: ${actuallyExistingOrders.length}`);
      console.log(
        `Actually existing: ${actuallyExistingOrders
          .map((o) => `${o.unitPrice}(ID:${o.orderId})`)
          .join(', ')}`,
      );

      for (const order of actuallyExistingOrders) {
        console.log(
          `\nAttempting removal ${removalCount + 1}/${
            allOrders.length
          }: Price ${order.unitPrice}, OrderId ${order.orderId}`,
        );

        await ost.removeAmountValue(order.unitPrice, order.orderId);
        removalCount++;

        console.log(
          `  ✅ Successfully removed: ${order.unitPrice} (OrderId: ${order.orderId})`,
        );

        console.log(`  Tree state after ${removalCount} removals:`);
        await printTreeStructure();
      }

      console.log('\n=== Removal Summary ===');
      console.log(`Total orders processed: ${allOrders.length}`);
      console.log(`Successfully removed: ${removalCount}`);
      console.log('\n=== Final Tree State ===');
      await printTreeStructure();
    });

    it('Should test edge case: dropLeft removes all but one, then remove the last', async () => {
      console.log('\n=== Edge Case Test: Remove Last Remaining Value ===');

      // Add several values
      const orders: Order[] = [
        { unitPrice: '9500', orderId: 1, amount: 100000000 },
        { unitPrice: '9400', orderId: 2, amount: 200000000 },
        { unitPrice: '9300', orderId: 3, amount: 300000000 },
        { unitPrice: '9200', orderId: 4, amount: 400000000 },
        { unitPrice: '9100', orderId: 5, amount: 500000000 },
      ];

      for (const order of orders) {
        await ost.insertAmountValue(
          order.unitPrice,
          order.orderId,
          constants.AddressZero,
          order.amount,
        );
      }

      console.log('Initial tree:');
      await printTreeStructure();

      // Drop almost everything, leaving only highest value(s)
      const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
      const dropAmount = totalAmount - 150000000; // Leave approximately one value

      console.log(`Dropping amount: ${dropAmount} (total was: ${totalAmount})`);
      await ost.dropValuesFromFirst(dropAmount, 0, 0);

      console.log('Tree after aggressive dropLeft:');
      await printTreeStructure();

      const remainingOrders = await getAllExistingOrders(orders);
      console.log(`Remaining orders: ${remainingOrders.length}`);

      // Try to remove the remaining order(s)
      for (const order of remainingOrders) {
        try {
          console.log(
            `Removing last remaining: ${order.unitPrice} (ID: ${order.orderId})`,
          );
          await ost.removeAmountValue(order.unitPrice, order.orderId);
          console.log('✅ Success');
        } catch (error: any) {
          console.log(`🐛 ERROR: ${error.message}`);
          throw error; // Re-throw to fail the test if this edge case has the bug
        }
      }

      console.log('Final tree (should be empty):');
      await printTreeStructure();
    });

    it('Should test with different dropLeft amounts to trigger various tree states', async () => {
      const dropAmounts = [
        1500000000, 2500000000, 3500000000, 4500000000, 6000000000,
      ];

      for (const dropAmount of dropAmounts) {
        console.log(`\n=== Testing with dropAmount: ${dropAmount} ===`);

        // Reset tree
        ost = await OrderStatisticsTree.new();

        // Insert test values
        const orders: Order[] = [];
        for (let i = 0; i < 10; i++) {
          const order: Order = {
            unitPrice: `${9500 - i * 100}`,
            orderId: i + 1,
            amount: 100000000 + i * 50000000,
          };
          orders.push(order);

          await ost.insertAmountValue(
            order.unitPrice,
            order.orderId,
            constants.AddressZero,
            order.amount,
          );
        }

        console.log('Tree before dropLeft:');
        await printTreeStructure();

        // Execute dropLeft
        await ost.dropValuesFromFirst(dropAmount, 0, 0);

        console.log('Tree after dropLeft:');
        await printTreeStructure();

        // Try to remove all remaining values
        const remainingOrders = await getAllExistingOrders(orders);
        console.log(
          `Attempting to remove ${remainingOrders.length} remaining values...`,
        );

        let errorInThisTest = false;
        for (const order of remainingOrders) {
          try {
            await ost.removeAmountValue(order.unitPrice, order.orderId);
          } catch (error: any) {
            console.log(
              `🐛 ERROR with dropAmount ${dropAmount}: ${error.message}`,
            );
            errorInThisTest = true;
            break;
          }
        }

        if (errorInThisTest) {
          console.log(`Bug reproduced with dropAmount: ${dropAmount}`);
        } else {
          console.log(`No error with dropAmount: ${dropAmount}`);
        }
      }
    });

    it('Should test edge case: dropRight removes all but one, then remove the last', async () => {
      console.log(
        '\n=== Edge Case Test: Remove Last Remaining Value (DropRight) ===',
      );

      // Add several values
      const orders: Order[] = [
        { unitPrice: '9100', orderId: 1, amount: 100000000 },
        { unitPrice: '9200', orderId: 2, amount: 200000000 },
        { unitPrice: '9300', orderId: 3, amount: 300000000 },
        { unitPrice: '9400', orderId: 4, amount: 400000000 },
        { unitPrice: '9500', orderId: 5, amount: 500000000 },
      ];

      for (const order of orders) {
        await ost.insertAmountValue(
          order.unitPrice,
          order.orderId,
          constants.AddressZero,
          order.amount,
        );
      }

      console.log('Initial tree:');
      await printTreeStructure();

      // Drop almost everything, leaving only lowest value(s)
      const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
      const dropAmount = totalAmount - 150000000; // Leave approximately one value

      console.log(`Dropping amount: ${dropAmount} (total was: ${totalAmount})`);
      await ost.dropValuesFromLast(dropAmount, 0, 0);

      console.log('Tree after aggressive dropRight:');
      await printTreeStructure();

      const remainingOrders = await getAllExistingOrders(orders);
      console.log(`Remaining orders: ${remainingOrders.length}`);

      // Try to remove the remaining order(s)
      for (const order of remainingOrders) {
        try {
          console.log(
            `Removing last remaining: ${order.unitPrice} (ID: ${order.orderId})`,
          );
          await ost.removeAmountValue(order.unitPrice, order.orderId);
          console.log('✅ Success');
        } catch (error: any) {
          console.log(`🐛 ERROR: ${error.message}`);
          throw error; // Re-throw to fail the test if this edge case has the bug
        }
      }

      console.log('Final tree (should be empty):');
      await printTreeStructure();
    });

    it('Should test with different dropRight amounts to trigger various tree states', async () => {
      const dropAmounts = [
        1500000000, 2500000000, 3500000000, 4500000000, 6000000000,
      ];

      for (const dropAmount of dropAmounts) {
        console.log(`\n=== Testing with dropRight amount: ${dropAmount} ===`);

        // Reset tree
        ost = await OrderStatisticsTree.new();

        // Insert test values
        const orders: Order[] = [];
        for (let i = 0; i < 10; i++) {
          const order: Order = {
            unitPrice: `${9100 + i * 100}`,
            orderId: i + 1,
            amount: 100000000 + i * 50000000,
          };
          orders.push(order);

          await ost.insertAmountValue(
            order.unitPrice,
            order.orderId,
            constants.AddressZero,
            order.amount,
          );
        }

        console.log('Tree before dropRight:');
        await printTreeStructure();

        // Execute dropRight
        await ost.dropValuesFromLast(dropAmount, 0, 0);

        console.log('Tree after dropRight:');
        await printTreeStructure();

        // Try to remove all remaining values
        const remainingOrders = await getAllExistingOrders(orders);
        console.log(
          `Attempting to remove ${remainingOrders.length} remaining values...`,
        );

        let errorInThisTest = false;
        for (const order of remainingOrders) {
          try {
            await ost.removeAmountValue(order.unitPrice, order.orderId);
          } catch (error: any) {
            console.log(
              `🐛 ERROR with dropRight amount ${dropAmount}: ${error.message}`,
            );
            errorInThisTest = true;
            break;
          }
        }

        if (errorInThisTest) {
          console.log(`Bug reproduced with dropRight amount: ${dropAmount}`);
        } else {
          console.log(`No error with dropRight amount: ${dropAmount}`);
        }
      }
    });
  });
});

async function printTreeStructure(): Promise<void> {
  let value = await ost.firstValue();

  if (value.toString() === '0') {
    console.log('Tree is empty');
    return;
  }

  const treeData: any[] = [];

  while (value.toString() !== '0') {
    const node = await ost.getNode(value);
    treeData.push({
      value: value.toString(),
      parent: node._parent.toString(),
      left: node._left.toString(),
      right: node._right.toString(),
      red: node._red.toString(),
      orderCounter: node._orderCounter.toString(),
      orderTotalAmount: node._orderTotalAmount.toString(),
    });
    value = await ost.nextValue(value);
  }

  console.table(treeData);
}

async function getAllExistingOrders(orders: Order[]): Promise<Order[]> {
  const existingOrders: Order[] = [];
  for (const order of orders) {
    const exists = await ost.valueExists(order.unitPrice);
    if (exists) {
      existingOrders.push(order);
    }
  }
  return existingOrders;
}
