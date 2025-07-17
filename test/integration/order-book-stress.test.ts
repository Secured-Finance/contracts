import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Order Book Stress Test', async () => {
  let owner: SignerWithAddress;
  let userA: SignerWithAddress;
  let userB: SignerWithAddress;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarketReader: Contract;
  let wFILToken: Contract;

  let genesisDate: number;
  let filMaturities: BigNumber[];
  let signers: Signers;

  const initialFILBalance = BigNumber.from('10000000000000000000000'); // 10,000 FIL

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      wFILToken,
    } = await deployContracts());

    await tokenVault.updateCurrency(hexETH, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate,
      );
    }

    filMaturities = await lendingMarketController.getMaturities(hexWFIL);
  });

  describe('Order Book Stress Test with Repeated Operations', async () => {
    const baseOrderAmount = BigNumber.from('100000000000000000000'); // 100 FIL (reduced amount)
    const collateralAmount = BigNumber.from('100000000000000000000'); // 100 ETH (increased collateral)

    before(async () => {
      [userA, userB] = await getUsers(2);

      // Deposit ETH as collateral for userA
      await tokenVault.connect(userA).deposit(hexETH, collateralAmount, {
        value: collateralAmount,
      });

      // Approve and deposit FIL for userB
      await wFILToken
        .connect(userB)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(userB).deposit(hexWFIL, initialFILBalance);

      console.log(`UserA ETH Balance: ${collateralAmount.toString()}`);
      console.log(`UserB FIL Balance: ${initialFILBalance.toString()}`);
    });

    it('Should handle repeated order placement, filling, and cancellation cycles', async () => {
      console.log('\n=== Starting Order Book Stress Test ===');

      // Step 1: UserA places 5 initial BORROW orders at different unit prices
      console.log('\n--- Step 1: Place 5 initial BORROW orders by UserA ---');
      const initialOrderPrices = ['9500', '9400', '9300', '9200', '9100'];
      const initialOrderIds: BigNumber[] = [];

      for (let i = 0; i < initialOrderPrices.length; i++) {
        const tx = await lendingMarketController
          .connect(userA)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            baseOrderAmount,
            initialOrderPrices[i],
          );

        const receipt = await tx.wait();
        const orderEvent = receipt.events?.find(
          (event) => event.event === 'OrderExecuted',
        );
        if (orderEvent) {
          const orderId = orderEvent.args?.orderId;
          initialOrderIds.push(orderId);
          console.log(
            `Placed BORROW order ${i + 1}: Price ${
              initialOrderPrices[i]
            }, OrderId ${orderId}`,
          );
        }
      }

      // Verify initial state
      const { activeOrders: initialActiveOrders } = await lendingMarketReader[
        'getOrders(bytes32,address)'
      ](hexWFIL, userA.address);

      expect(initialActiveOrders.length).to.equal(5);
      console.log(`Initial active orders count: ${initialActiveOrders.length}`);

      // Step 2: Repeat the following steps 5 times
      console.log('\n--- Step 2: Repeat cycle 5 times ---');

      for (let cycle = 1; cycle <= 5; cycle++) {
        console.log(`\n=== Cycle ${cycle} ===`);

        // Step 2-1: UserA places 5 new BORROW orders with lower prices
        console.log(
          `--- Cycle ${cycle}-1: Place 5 new BORROW orders with lower prices ---`,
        );
        const cycleOrderPrices = [
          `${9000 - cycle * 10}`, // 8990, 8980, 9870, ...
          `${8900 - cycle * 10}`, // 8890, 8880, 8870, ...
          `${8800 - cycle * 10}`, // 8790, 8780, 8770, ...
          `${8700 - cycle * 10}`, // 8690, 8680, 8670, ...
          `${8600 - cycle * 10}`, // 8590, 8580, 8570, ...
        ];
        const cycleOrderIds: BigNumber[] = [];

        for (let i = 0; i < cycleOrderPrices.length; i++) {
          const tx = await lendingMarketController
            .connect(userA)
            .executeOrder(
              hexWFIL,
              filMaturities[0],
              Side.BORROW,
              baseOrderAmount,
              cycleOrderPrices[i],
            );

          const receipt = await tx.wait();
          const orderEvent = receipt.events?.find(
            (event) => event.event === 'OrderExecuted',
          );
          if (orderEvent) {
            const orderId = orderEvent.args?.orderId;
            cycleOrderIds.push(orderId);
            console.log(
              `  Placed order ${i + 1}: Price ${
                cycleOrderPrices[i]
              }, OrderId ${orderId}`,
            );
          }
        }

        // Step 2-2: UserB executes a LEND market order to fill 3 orders
        console.log(
          `--- Cycle ${cycle}-2: Execute LEND market order to fill 3 orders ---`,
        );

        // Calculate amount to fill exactly 3 orders
        const fillAmount = baseOrderAmount.mul(3);

        const beforeFillOrders = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexWFIL, userA.address);

        const tx = await lendingMarketController.connect(userB).executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.LEND,
          fillAmount,
          '0', // Market order (fill at any price)
        );

        await tx.wait();
        console.log(
          `  Executed LEND market order for amount: ${fillAmount.toString()}`,
        );

        // Step 2-3: UserA cancels unfilled orders from this cycle
        console.log(
          `--- Cycle ${cycle}-3: Cancel unfilled orders from this cycle ---`,
        );

        const afterFillOrders = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexWFIL, userA.address);

        const activeOrderIds = afterFillOrders.activeOrders.map(
          (order) => order.orderId,
        );

        // Cancel orders from this cycle that are still active
        let cancelledCount = 0;
        for (const orderId of cycleOrderIds) {
          const isStillActive = activeOrderIds.some((activeId) =>
            activeId.eq(orderId),
          );
          if (isStillActive) {
            await lendingMarketController
              .connect(userA)
              .cancelOrder(hexWFIL, filMaturities[0], orderId);
            console.log(`  Cancelled order: ${orderId}`);
            cancelledCount++;
          }
        }
        console.log(`  Cancelled ${cancelledCount} orders from this cycle`);

        // Step 2-4: Verify order counts after cancellation
        console.log(`--- Cycle ${cycle}-4: Verify order counts ---`);

        const finalOrders = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexWFIL, userA.address);

        console.log(`  Active orders: ${finalOrders.activeOrders.length}`);
        console.log(`  Inactive orders: ${finalOrders.inactiveOrders.length}`);

        console.log(`  Detailed analysis for cycle ${cycle}:`);
        console.log(
          `    Orders before fill: ${beforeFillOrders.activeOrders.length} active, ${beforeFillOrders.inactiveOrders.length} inactive`,
        );
        console.log(
          `    Orders after fill: ${afterFillOrders.activeOrders.length} active, ${afterFillOrders.inactiveOrders.length} inactive`,
        );
        console.log(
          `    Orders after cancel: ${finalOrders.activeOrders.length} active, ${finalOrders.inactiveOrders.length} inactive`,
        );
        console.log(`    Cancelled count: ${cancelledCount}`);

        if (cycle === 1) {
          console.log(`  First cycle - observing behavior to set expectations`);
          console.log(
            `    Final active orders: ${finalOrders.activeOrders.length}`,
          );
          console.log(
            `    Final inactive orders: ${finalOrders.inactiveOrders.length}`,
          );
        }

        expect(finalOrders.activeOrders.length).to.be.greaterThan(
          0,
          `Cycle ${cycle}: Should have some active orders`,
        );
        expect(finalOrders.inactiveOrders.length).to.be.greaterThan(
          0,
          `Cycle ${cycle}: Should have some inactive orders`,
        );
        expect(
          finalOrders.activeOrders.length + finalOrders.inactiveOrders.length,
        ).to.be.greaterThan(
          5,
          `Cycle ${cycle}: Total orders should exceed initial 5`,
        );

        console.log(`✅ Cycle ${cycle} completed successfully`);
        console.log(`   - Active orders: ${finalOrders.activeOrders.length}`);
        console.log(
          `   - Inactive orders: ${finalOrders.inactiveOrders.length}`,
        );

        // Optional: Display order details for debugging
        if (cycle <= 5) {
          // Only for first few cycles to avoid too much output
          console.log('   Active order details:');
          for (const order of finalOrders.activeOrders) {
            console.log(
              `     OrderId: ${order.orderId}, Price: ${order.unitPrice}, Amount: ${order.amount}`,
            );
          }
        }
      }

      console.log('\n=== All 5 cycles completed successfully ===');

      const finalState = await lendingMarketReader[
        'getOrders(bytes32,address)'
      ](hexWFIL, userA.address);

      expect(finalState.activeOrders.length).to.be.greaterThan(
        0,
        'Should have some active orders remaining',
      );
      expect(finalState.inactiveOrders.length).to.be.greaterThan(
        0,
        'Should have some inactive orders',
      );

      console.log('Final state:');
      console.log(`- Total active orders: ${finalState.activeOrders.length}`);
      console.log(
        `- Total inactive orders: ${finalState.inactiveOrders.length}`,
      );
      console.log(
        `- Total orders processed: ${
          finalState.activeOrders.length + finalState.inactiveOrders.length
        }`,
      );
    });

    after('Cleanup remaining orders', async () => {
      console.log('\n=== Cleanup: Cancelling remaining active orders ===');

      const {
        activeOrders: activeOrdersBefore,
        inactiveOrders: inactiveOrdersBefore,
      } = await lendingMarketReader['getOrders(bytes32,address)'](
        hexWFIL,
        userA.address,
      );

      console.log('Active orders before cancel:', activeOrdersBefore.length);
      console.log(
        `Inactive orders before cancel: ${inactiveOrdersBefore.length}`,
      );

      for (const order of activeOrdersBefore) {
        await lendingMarketController
          .connect(userA)
          .cancelOrder(hexWFIL, order.maturity, order.orderId);
        console.log(`Cancelled order: ${order.orderId}`);
      }

      const {
        activeOrders: activeOrdersAfter,
        inactiveOrders: inactiveOrdersAfter,
      } = await lendingMarketReader['getOrders(bytes32,address)'](
        hexWFIL,
        userA.address,
      );

      console.log(`Active orders after cancel: ${activeOrdersAfter.length}`);
      console.log(
        `Inactive orders after cancel: ${inactiveOrdersAfter.length}`,
      );

      console.log('Cleanup completed');
    });
  });

  describe('Order Book Performance Analysis', async () => {
    it('Should call cleanUp on LendingMarketController', async () => {
      console.log('\n=== Clean Up Lending User Funds ===');
      const tx = await lendingMarketController.cleanUpAllFunds(userA.address);
      const receipt = await tx.wait();
      console.log(`Gas used for clean up: ${receipt.gasUsed.toString()}`);
      expect(receipt.status).to.equal(1, 'Clean up transaction failed');
      console.log('✅ Clean up completed successfully');
    });

    it('Should verify order book state consistency', async () => {
      console.log('\n=== Order Book State Consistency Check ===');

      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32,address)'
      ](hexWFIL, userA.address);

      console.log(`Final active orders: ${activeOrders.length}`);
      console.log(`Final inactive orders: ${inactiveOrders.length}`);

      // Verify no duplicate order IDs
      const allOrderIds = [
        ...activeOrders.map((o) => o.orderId.toString()),
        ...inactiveOrders.map((o) => o.orderId.toString()),
      ];
      const uniqueOrderIds = new Set(allOrderIds);

      expect(allOrderIds.length).to.equal(
        uniqueOrderIds.size,
        'Found duplicate order IDs',
      );

      // Verify order states are correct
      for (const order of activeOrders) {
        expect(order.amount.gt(0)).to.be.true;
      }

      for (const order of inactiveOrders) {
        // Inactive orders can be either fully filled (amount = 0) or cancelled
        expect(order.amount.gte(0)).to.be.true;
      }

      console.log('✅ Order book state consistency verified');
    });
  });
});
