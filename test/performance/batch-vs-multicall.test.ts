import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC } from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Batch vs Multicall Gas Comparison', () => {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let tokenVault: Contract;
  let lendingMarketController: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  const orderCounts = [1, 3, 5, 10];
  const gasResults: Record<
    number,
    { batch: BigNumber; multicall: BigNumber; savings: string }
  > = {};

  const initializeContracts = async () => {
    const signers = await ethers.getSigners();
    [, alice, bob] = signers;

    ({ genesisDate, tokenVault, lendingMarketController } =
      await deployContracts());

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);

    // Deploy Lending Markets
    const preOpeningDate = genesisDate - 604800;
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexETH,
        genesisDate,
        preOpeningDate,
      );
      await lendingMarketController.createOrderBook(
        hexUSDC,
        genesisDate,
        preOpeningDate,
      );
    }

    maturities = await lendingMarketController.getMaturities(hexETH);

    // Setup: Prepare market makers (bob) with orders and alice with funds
    const bobDepositAmount = ethers.utils.parseEther('1000');
    await tokenVault.connect(bob).deposit(hexETH, bobDepositAmount, {
      value: bobDepositAmount,
    });

    // Bob creates lend orders as market maker
    for (let i = 0; i < 10; i++) {
      await lendingMarketController
        .connect(bob)
        .executeOrder(
          hexETH,
          maturities[0],
          Side.LEND,
          ethers.utils.parseEther('10'),
          9600,
        );
    }

    // Alice deposits ETH once for all tests
    const aliceDepositAmount = ethers.utils.parseEther('100');
    await tokenVault.connect(alice).deposit(hexETH, aliceDepositAmount, {
      value: aliceDepositAmount,
    });
  };

  before('Initialize contracts', async () => {
    await initializeContracts();
  });

  describe('Gas Cost Comparison', () => {
    const orderAmount = ethers.utils.parseEther('5');
    const unitPrice = BigNumber.from(9500);

    for (const orderCount of orderCounts) {
      describe(`With ${orderCount} order(s)`, () => {
        it('executeBatch: multiple orders', async () => {
          const actions: number[] = [];
          const data: string[] = [];

          // BatchAction.EXECUTE_ORDER = 1
          const ACTION_EXECUTE_ORDER = 1;

          // Actions: Execute orders
          for (let i = 0; i < orderCount; i++) {
            actions.push(ACTION_EXECUTE_ORDER);
            const orderArgs = ethers.utils.defaultAbiCoder.encode(
              [
                'tuple(bytes32 ccy, uint256 maturity, uint8 side, uint256 amount, uint256 unitPrice)',
              ],
              [[hexETH, maturities[0], Side.BORROW, orderAmount, unitPrice]],
            );
            data.push(orderArgs);
          }

          // Use estimateGas to measure without changing state
          const gasEstimate = await lendingMarketController
            .connect(alice)
            .estimateGas.executeBatch(actions, data);

          gasResults[orderCount] = {
            batch: gasEstimate,
            multicall: BigNumber.from(0),
            savings: '0%',
          };

          console.log(
            `\n    executeBatch (${orderCount} orders): ${gasEstimate.toString()} gas`,
          );
        });

        it('multicall: multiple orders', async () => {
          const calls: string[] = [];

          // Calls: Execute orders
          for (let i = 0; i < orderCount; i++) {
            const orderCall =
              lendingMarketController.interface.encodeFunctionData(
                'executeOrder',
                [hexETH, maturities[0], Side.BORROW, orderAmount, unitPrice],
              );
            calls.push(orderCall);
          }

          // Use estimateGas to measure without changing state
          const gasEstimate = await lendingMarketController
            .connect(alice)
            .estimateGas.multicall(calls);

          gasResults[orderCount].multicall = gasEstimate;

          const batchGas = gasResults[orderCount].batch;
          const multicallGas = gasEstimate;
          const savings = multicallGas
            .sub(batchGas)
            .mul(10000)
            .div(multicallGas);
          const savingsPercent = (savings.toNumber() / 100).toFixed(2);
          gasResults[orderCount].savings = `${savingsPercent}%`;

          console.log(
            `    multicall (${orderCount} orders): ${gasEstimate.toString()} gas`,
          );
          console.log(`    Gas savings with executeBatch: ${savingsPercent}%`);
          console.log(
            `    Difference: ${multicallGas.sub(batchGas).toString()} gas`,
          );

          // Verify that executeBatch uses less gas for 10 or more orders
          if (orderCount >= 10) {
            expect(batchGas).to.be.lt(
              multicallGas,
              `executeBatch should use less gas than multicall for ${orderCount} orders`,
            );
          }
        });
      });
    }

    after('Print summary', () => {
      console.log('\n\n=== Gas Cost Comparison Summary ===');
      console.log('Order Count | executeBatch | multicall | Savings');
      console.log('-----------|------------|----------|--------');
      for (const count of orderCounts) {
        if (gasResults[count]) {
          console.log(
            `${count.toString().padStart(10)} | ${gasResults[count].batch
              .toString()
              .padStart(10)} | ${gasResults[count].multicall
              .toString()
              .padStart(8)} | ${gasResults[count].savings.padStart(7)}`,
          );
        }
      }
      console.log('===================================\n');
    });
  });
});
