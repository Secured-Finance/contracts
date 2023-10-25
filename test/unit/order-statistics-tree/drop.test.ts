import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import {
  borrowingLimitOrders,
  borrowingMarketOrders,
  borrowingUnwindOrders,
} from './data/borrowing-orders';
import {
  lendingLimitOrders,
  lendingMarketOrders,
  lendingUnwindOrders,
} from './data/lending-orders';

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

export interface UnwindCondition {
  title: string;
  orders: Order[];
  inputs: {
    title: string;
    droppedAmount: number;
    droppedAmountInFV: number;
    filledAmount: number;
    filledFutureValue: number;
  }[];
}

interface Test {
  label: string;
  method: string;
  marketOrderConditions: Condition[];
  limitOrderConditions: Condition[];
  lendingUnwindOrders: UnwindCondition[];
}

describe('OrderStatisticsTree - drop values', () => {
  const tests: Test[] = [
    {
      label: 'Lending',
      method: 'dropValuesFromLast',
      marketOrderConditions: lendingMarketOrders,
      limitOrderConditions: lendingLimitOrders,
      lendingUnwindOrders: lendingUnwindOrders,
    },
    {
      label: 'Borrowing',
      method: 'dropValuesFromFirst',
      marketOrderConditions: borrowingMarketOrders,
      limitOrderConditions: borrowingLimitOrders,
      lendingUnwindOrders: borrowingUnwindOrders,
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

                await ost[test.method](input.targetAmount, 0, 0);
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

                await ost[test.method](input.targetAmount / 2, 0, 0);
                await getTotalAmount('<After data is dropped 1>');

                await ost[test.method](input.targetAmount / 2, 0, 0);
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

                await ost[test.method](input.targetAmount, 0, 0);
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

                await ost[test.method](input.targetAmount, 0, 0);
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
                  0,
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

    describe(`${test.label} unwind orders`, async () => {
      describe('Drop nodes from the tree', async () => {
        for (const condition of test.lendingUnwindOrders) {
          describe(condition.title, async () => {
            for (const input of condition.inputs) {
              const title = `${input.title}: Unwind future value ${input?.droppedAmountInFV}`;

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

                const { droppedAmount, droppedAmountInFV } = await ost[
                  test.method
                ](0, input.droppedAmountInFV, 0).then(
                  ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
                );

                const totalAmountAfter = await getTotalAmount('<After>');

                expect(droppedAmount.toNumber()).equal(input.filledAmount);
                expect(droppedAmountInFV.toNumber()).equal(
                  input.filledFutureValue,
                );
                expect(
                  totalAmountBefore?.sub(totalAmountAfter).toNumber(),
                ).equal(input.droppedAmount);
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
          fvAmount: 62500000,
          pvAmount: 50000000,
        },
        {
          label: 'Drop 1 node',
          fvAmount: 125000000,
          pvAmount: 100000000,
        },
        {
          label: 'Drop 1 node, Fill 1 node partially',
          fvAmount: 250000000,
          pvAmount: 200012500,
        },
        {
          label: 'Drop 2 nodes, Fill 1 node partially',
          fvAmount: 625000000,
          pvAmount: 500062505,
        },
      ];

      describe('Estimate the dropped FV amount by PV amount ', async () => {
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

            const { droppedAmountInFV: estimatedAmount } =
              await ost.calculateDroppedAmountFromLeft(test.pvAmount, 0, 0);
            expect(estimatedAmount.toNumber()).equal(test.fvAmount);

            const totalAmountBefore = await getTotalAmount('<Before>');

            const { droppedAmount } = await ost
              .dropValuesFromFirst(test.pvAmount, 0, 0)
              .then(
                ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
              );

            const totalAmountAfter = await getTotalAmount('<After>');

            expect(droppedAmount.toString()).to.equal(test.pvAmount.toString());
            expect(totalAmountAfter.add(droppedAmount.toString())).to.equal(
              totalAmountBefore,
            );
          });
        }
      });

      describe('Estimate the dropped PV amount by FV amount ', async () => {
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

            const { droppedAmount: estimatedAmount } =
              await ost.calculateDroppedAmountFromLeft(0, test.fvAmount, 0);
            expect(estimatedAmount.toNumber()).equal(test.pvAmount);

            const totalAmountBefore = await getTotalAmount('<Before>');

            const { droppedAmount } = await ost
              .dropValuesFromFirst(0, test.fvAmount, 0)
              .then(
                ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
              );

            const totalAmountAfter = await getTotalAmount('<After>');

            expect(droppedAmount.toString()).to.equal(test.pvAmount.toString());
            expect(totalAmountAfter.add(droppedAmount.toString())).to.equal(
              totalAmountBefore,
            );
          });
        }
      });
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
          fvAmount: 62500000,
          pvAmount: 50000000,
        },
        {
          label: 'Drop 1 node',
          fvAmount: 125000000,
          pvAmount: 100000000,
        },
        {
          label: 'Drop 1 node, Fill 1 node partially',
          fvAmount: 250000000,
          pvAmount: 199987500,
        },
        {
          label: 'Drop 2 nodes, Fill 1 node partially',
          fvAmount: 625000000,
          pvAmount: 499937505,
        },
      ];

      describe('Estimate the dropped FV amount by PV amount ', async () => {
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

            const { droppedAmountInFV: estimatedAmount } =
              await ost.calculateDroppedAmountFromRight(test.pvAmount, 0, 0);
            expect(estimatedAmount.toNumber()).equal(test.fvAmount);

            const totalAmountBefore = await getTotalAmount('<Before>');

            const { droppedAmount } = await ost
              .dropValuesFromLast(test.pvAmount, 0, 0)
              .then(
                ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
              );

            const totalAmountAfter = await getTotalAmount('<After>');

            expect(droppedAmount.toString()).to.equal(test.pvAmount.toString());
            expect(totalAmountAfter.add(droppedAmount.toString())).to.equal(
              totalAmountBefore,
            );
          });
        }
      });

      describe('Estimate the dropped PV amount by FV amount ', async () => {
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

            const { droppedAmount: estimatedAmount } =
              await ost.calculateDroppedAmountFromRight(0, test.fvAmount, 0);
            expect(estimatedAmount.toNumber()).equal(test.pvAmount);

            const totalAmountBefore = await getTotalAmount('<Before>');

            const { droppedAmount } = await ost
              .dropValuesFromLast(0, test.fvAmount, 0)
              .then(
                ({ logs }) => logs.find(({ event }) => event === 'Drop').args,
              );

            const totalAmountAfter = await getTotalAmount('<After>');

            expect(droppedAmount.toString()).to.equal(test.pvAmount.toString());
            expect(totalAmountAfter.add(droppedAmount.toString())).to.equal(
              totalAmountBefore,
            );
          });
        }
      });
    });
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
