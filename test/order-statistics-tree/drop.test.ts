import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import {
  borrowingLimitOrders,
  borrowingMarketOrders,
} from './data/borrowing-orders';
import { lendingLimitOrders, lendingMarketOrders } from './data/lending-orders';

const OrderStatisticsTree = artifacts.require(
  'HitchensOrderStatisticsTreeContract.sol',
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
