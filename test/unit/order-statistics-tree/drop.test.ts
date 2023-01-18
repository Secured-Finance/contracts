import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import {
  borrowingLimitOrders,
  borrowingMarketOrders,
} from './data/borrowing-orders';
import { lendingLimitOrders, lendingMarketOrders } from './data/lending-orders';

const OrderStatisticsTree = artifacts.require(
  'OrderStatisticsTreeContract.sol',
);

let ost: Contract;

interface Order {
  unitPrice: number;
  orderId: number;
  amount: number;
}

export interface Condition {
  title: string;
  orders: Order[];
  inputs: {
    title: string;
    targetAmount: number;
    droppedAmount: number;
    limitValue?: number;
    droppedValue?: number;
  }[];
}

interface Test {
  label: string;
  method: string;
  marketOrderConditions: Condition[];
  limitOrderConditions: Condition[];
}

describe('OrderStatisticsTree - drop values', () => {
  const tests: Test[] = [
    {
      label: 'Lending',
      method: 'dropValuesFromFirst',
      marketOrderConditions: lendingMarketOrders,
      limitOrderConditions: lendingLimitOrders,
    },
    {
      label: 'Borrowing',
      method: 'dropValuesFromLast',
      marketOrderConditions: borrowingMarketOrders,
      limitOrderConditions: borrowingLimitOrders,
    },
  ];

  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  for (const test of tests) {
    describe(`${test.label} market orders`, async () => {
      describe('Drop nodes from the tree by one action', async () => {
        for (const condition of test.marketOrderConditions) {
          describe(condition.title, async () => {
            for (const input of condition.inputs) {
              it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
                for (const order of condition.orders) {
                  await ost.insertAmountValue(
                    order.unitPrice,
                    order.orderId,
                    constants.AddressZero,
                    order.amount,
                  );
                }
                const totalAmountBefore = await getTotalAmount('<Before>');

                await ost[test.method](input.targetAmount, 0);
                const totalAmountAfter = await getTotalAmount('<After>');

                expect(
                  totalAmountBefore?.sub(totalAmountAfter).toNumber(),
                ).equal(input.droppedAmount);
              });
            }
          });
        }
      });

      describe('Drop nodes from the tree by multiple actions', async () => {
        for (const condition of test.marketOrderConditions) {
          describe(condition.title, async () => {
            for (const input of condition.inputs) {
              it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
                for (const order of condition.orders) {
                  await ost.insertAmountValue(
                    order.unitPrice,
                    order.orderId,
                    constants.AddressZero,
                    order.amount,
                  );
                }
                await getTotalAmount('<Before>');

                await ost[test.method](input.targetAmount / 2, 0);
                await getTotalAmount('<After data is dropped 1>');

                await ost[test.method](input.targetAmount / 2, 0);
                await getTotalAmount('<After data is dropped 2>');
              });
            }
          });
        }
      });

      describe('Drop nodes from the tree by repeated inserting and dropping', async () => {
        for (const condition of test.marketOrderConditions) {
          describe(condition.title, async () => {
            for (const input of condition.inputs) {
              it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
                for (const order of condition.orders) {
                  await ost.insertAmountValue(
                    order.unitPrice,
                    order.orderId,
                    constants.AddressZero,
                    order.amount,
                  );
                }
                const totalAmountBefore = await getTotalAmount('<Before>');

                await ost[test.method](input.targetAmount, 0);
                const totalAmountAfter1 = await getTotalAmount(
                  '<After data is dropped>',
                );

                expect(
                  totalAmountBefore?.sub(totalAmountAfter1).toNumber(),
                ).equal(input.droppedAmount);

                for (const order of condition.orders) {
                  await ost.insertAmountValue(
                    order.unitPrice,
                    order.orderId + 100,
                    constants.AddressZero,
                    order.amount,
                  );
                }
                const totalAmountAfter2 = await getTotalAmount(
                  '<After data is inserted again>',
                );

                await ost[test.method](input.targetAmount, 0);
                const totalAmountAfter3 = await getTotalAmount(
                  '<After data is dropped again>',
                );

                expect(
                  totalAmountAfter2?.sub(totalAmountAfter3).toNumber(),
                ).equal(input.droppedAmount);
              });
            }
          });
        }
      });
    });

    describe(`${test.label} limit orders`, async () => {
      describe('Drop nodes from the tree', async () => {
        for (const condition of test.limitOrderConditions) {
          describe(condition.title, async () => {
            for (const input of condition.inputs) {
              const title = `${input.title}: Target amount is ${input.targetAmount}, Limit value ${input?.limitValue}`;

              it(title, async () => {
                for (const order of condition.orders) {
                  await ost.insertAmountValue(
                    order.unitPrice,
                    order.orderId,
                    constants.AddressZero,
                    order.amount,
                  );
                }
                const totalAmountBefore = await getTotalAmount('<Before>');

                await ost[test.method](
                  input.targetAmount,
                  input?.limitValue || 0,
                );
                const totalAmountAfter = await getTotalAmount('<After>');

                expect(
                  totalAmountBefore?.sub(totalAmountAfter).toNumber(),
                ).equal(input.droppedAmount);
                expect(await ost.valueExists(input.droppedValue)).to.be.false;
              });
            }
          });
        }
      });
    });
  }

  describe(`Estimation`, async () => {
    describe('Estimate the dropped amount from the lending tree', async () => {
      const orders = [
        { unitPrice: 8000, orderId: 1, amount: 100000000 },
        { unitPrice: 8001, orderId: 2, amount: 300000000 },
        { unitPrice: 8002, orderId: 3, amount: 500000000 },
      ];

      const tests = [
        {
          label: 'Drop 1 node partially',
          droppedFVAmount: 62500000,
          estimatedPVAmount: 50000000,
        },
        {
          label: 'Drop 1 node',
          droppedFVAmount: 125000000,
          estimatedPVAmount: 100000000,
        },
        {
          label: 'Drop 1 node, Fill 1 node partially',
          droppedFVAmount: 250000000,
          estimatedPVAmount: 200012500,
        },
        {
          label: 'Drop 2 nodes, Fill 1 node partially',
          droppedFVAmount: 625000000,
          estimatedPVAmount: 500062505,
        },
      ];

      for (const test of tests) {
        it(test.label, async () => {
          for (const order of orders) {
            await ost.insertAmountValue(
              order.unitPrice,
              order.orderId,
              constants.AddressZero,
              order.amount,
            );
          }

          const droppedFVAmount = await ost.estimateDroppedAmountFromFirst(
            test.droppedFVAmount,
          );
          expect(droppedFVAmount.toNumber()).equal(test.estimatedPVAmount);

          const totalAmountBefore = await getTotalAmount('<Before>');

          const { remainingOrderAmountInPV } = await ost
            .dropValuesFromFirst(test.estimatedPVAmount, 0)
            .then(
              ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
            );

          const totalAmountAfter = await getTotalAmount('<After>');

          expect(
            totalAmountAfter
              .add(remainingOrderAmountInPV.toString())
              .add(test.estimatedPVAmount.toString()),
          ).to.equal(totalAmountBefore);
        });
      }
    });

    describe('Estimate the dropped amount from the borrowing tree', async () => {
      const orders = [
        { unitPrice: 8000, orderId: 1, amount: 100000000 },
        { unitPrice: 7999, orderId: 2, amount: 300000000 },
        { unitPrice: 7998, orderId: 3, amount: 500000000 },
      ];

      const tests = [
        {
          label: 'Drop 1 node partially',
          droppedFVAmount: 62500000,
          estimatedPVAmount: 50000000,
        },
        {
          label: 'Drop 1 node',
          droppedFVAmount: 125000000,
          estimatedPVAmount: 100000000,
        },
        {
          label: 'Drop 1 node, Fill 1 node partially',
          droppedFVAmount: 250000000,
          estimatedPVAmount: 199987500,
        },
        {
          label: 'Drop 2 nodes, Fill 1 node partially',
          droppedFVAmount: 625000000,
          estimatedPVAmount: 499937505,
        },
      ];

      for (const test of tests) {
        it(test.label, async () => {
          for (const order of orders) {
            await ost.insertAmountValue(
              order.unitPrice,
              order.orderId,
              constants.AddressZero,
              order.amount,
            );
          }

          const droppedFVAmount = await ost.estimateDroppedAmountFromLast(
            test.droppedFVAmount,
          );
          expect(droppedFVAmount.toNumber()).equal(test.estimatedPVAmount);

          const totalAmountBefore = await getTotalAmount('<Before>');

          const { remainingOrderAmountInPV } = await ost
            .dropValuesFromLast(test.estimatedPVAmount, 0)
            .then(
              ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
            );

          const totalAmountAfter = await getTotalAmount('<After>');

          expect(
            totalAmountAfter
              .add(remainingOrderAmountInPV.toString())
              .add(test.estimatedPVAmount.toString()),
          ).to.equal(totalAmountBefore);
        });
      }
    });
  });
});

async function getTotalAmount(msg?: string) {
  // msg && console.log(msg);

  let value = await ost.firstValue();
  let totalAmount = BigNumber.from(0);

  if (value.toString() === '0') {
    // console.table([{ value: 'No value found in the tree.' }]);
    return totalAmount;
  }

  let node = await ost.getNode(value);
  const nodes: any = [];

  while (value.toString() !== '0') {
    node = await ost.getNode(value);
    nodes.push({
      value: value.toString(),
      parent: node._parent.toString(),
      left: node._left.toString(),
      right: node._right.toString(),
      red: node._red,
      orderCounter: node._orderCounter.toString(),
      orderTotalAmount: node._orderTotalAmount.toString(),
    });

    value = await ost.nextValue(value);
    totalAmount = totalAmount.add(node._orderTotalAmount.toString());
  }

  // console.table(nodes);

  return totalAmount;
}
