import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import { Step, steps } from './steps';
import { limitOrderConditions, marketOrderConditions } from './test-data';
const OrderStatisticsTree = artifacts.require(
  'HitchensOrderStatisticsTreeContract.sol',
);

let ost: Contract;

describe('OrderStatisticsTree', () => {
  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  // it('Example', async () => {
  //   const orders = [
  //     { rate: 8000, orderId: 1, amount: 100000000 },
  //     { rate: 8001, orderId: 21, amount: 150000000 },
  //     { rate: 8001, orderId: 22, amount: 150000000 },
  //     { rate: 8002, orderId: 3, amount: 500000000 },
  //     { rate: 8003, orderId: 4, amount: 700000000 },
  //     { rate: 8004, orderId: 5, amount: 1300000000 },
  //     { rate: 8005, orderId: 6, amount: 1700000000 },
  //     { rate: 8006, orderId: 7, amount: 1900000000 },
  //     { rate: 8007, orderId: 8, amount: 2300000000 },
  //     { rate: 8008, orderId: 9, amount: 2700000000 },
  //     { rate: 8009, orderId: 10, amount: 2900000000 },
  //   ];

  //   for (const order of orders) {
  //     await ost.insertAmountValue(
  //       order.rate,
  //       order.orderId,
  //       constants.AddressZero,
  //       order.amount,
  //     );
  //   }

  //   await getTotalAmount();
  //   await ost.dropValuesFromLeft(900000000, 8002);
  //   await getTotalAmount();
  // });

  describe('Market Orders', async () => {
    describe('Should drop nodes from the tree by one action', async () => {
      for (const condition of marketOrderConditions) {
        describe(condition.title, async () => {
          for (const input of condition.inputs) {
            it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
              console.group();

              for (const order of condition.orders) {
                await ost.insertAmountValue(
                  order.rate,
                  order.orderId,
                  constants.AddressZero,
                  order.amount,
                );
              }
              const totalAmountBefore = await getTotalAmount('<Before>');

              await ost.dropValuesFromLeft(input.targetAmount, 0);
              const totalAmountAfter = await getTotalAmount('<After>');

              console.groupEnd();

              expect(totalAmountBefore?.sub(totalAmountAfter).toNumber()).equal(
                input.droppedAmount,
              );
            });
          }
        });
      }
    });

    describe('Should drop nodes from the tree by multiple actions', async () => {
      for (const condition of marketOrderConditions) {
        describe(condition.title, async () => {
          for (const input of condition.inputs) {
            it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
              console.group();

              for (const order of condition.orders) {
                await ost.insertAmountValue(
                  order.rate,
                  order.orderId,
                  constants.AddressZero,
                  order.amount,
                );
              }
              await getTotalAmount('<Before>');

              await ost.dropValuesFromLeft(input.targetAmount / 2, 0);
              await getTotalAmount('<After data is dropped 1>');

              await ost.dropValuesFromLeft(input.targetAmount / 2, 0);
              await getTotalAmount('<After data is dropped 2>');

              console.groupEnd();
            });
          }
        });
      }
    });

    describe('Should drop nodes from the tree by repeated inserting and dropping', async () => {
      for (const condition of marketOrderConditions) {
        describe(condition.title, async () => {
          for (const input of condition.inputs) {
            it(`${input.title}: Target amount is ${input.targetAmount}`, async () => {
              console.group();

              for (const order of condition.orders) {
                await ost.insertAmountValue(
                  order.rate,
                  order.orderId,
                  constants.AddressZero,
                  order.amount,
                );
              }
              const totalAmountBefore = await getTotalAmount('<Before>');

              await ost.dropValuesFromLeft(input.targetAmount, 0);
              const totalAmountAfter1 = await getTotalAmount(
                '<After data is dropped>',
              );

              expect(
                totalAmountBefore?.sub(totalAmountAfter1).toNumber(),
              ).equal(input.droppedAmount);

              for (const order of condition.orders) {
                await ost.insertAmountValue(
                  order.rate,
                  order.orderId,
                  constants.AddressZero,
                  order.amount,
                );
              }
              const totalAmountAfter2 = await getTotalAmount(
                '<After data is inserted again>',
              );

              await ost.dropValuesFromLeft(input.targetAmount, 0);
              const totalAmountAfter3 = await getTotalAmount(
                '<After data is dropped again>',
              );

              console.groupEnd();

              expect(
                totalAmountAfter2?.sub(totalAmountAfter3).toNumber(),
              ).equal(input.droppedAmount);
            });
          }
        });
      }
    });
  });

  describe('Limit Orders', async () => {
    describe('Should drop nodes from the tree', async () => {
      for (const condition of limitOrderConditions) {
        describe(condition.title, async () => {
          for (const input of condition.inputs) {
            const title = `${input.title}: Target amount is ${input.targetAmount}, Limit value ${input?.limitValue}`;

            it(title, async () => {
              console.group();

              for (const order of condition.orders) {
                await ost.insertAmountValue(
                  order.rate,
                  order.orderId,
                  constants.AddressZero,
                  order.amount,
                );
              }
              const totalAmountBefore = await getTotalAmount('<Before>');

              await ost.dropValuesFromLeft(
                input.targetAmount,
                input?.limitValue || 0,
              );
              const totalAmountAfter = await getTotalAmount('<After>');

              console.groupEnd();

              expect(totalAmountBefore?.sub(totalAmountAfter).toNumber()).equal(
                input.droppedAmount,
              );
            });
          }
        });
      }
    });
  });

  it('Should insert all orders and delete after', async () => {
    console.log('Number of steps: ' + steps.length);
    let s = await loadScenario(steps);
    await printScenario(steps);
    await printExists(steps);
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

async function printExists(steps: Step[]) {
  console.log();
  console.log('See if values exists');
  console.group('value, exists');

  for (const step of steps) {
    let element = step.rate;
    if (element > 0) {
      const exists = await ost.valueExists(element);
      console.log(element, exists);
    }
  }
  console.groupEnd();
}

async function printScenario(steps: Step[]) {
  // enumerate the sorted list and stats
  console.group('element, orderCount');
  for (const step of steps) {
    const element = step.rate;
    const orderCount = await ost.getValueCount(element);
    console.log(element, orderCount.toString(10));
  }
  console.groupEnd();

  // tree structure summary
  console.group('Tree Properties');
  const rootCount = await ost.getRootCount();
  const first = await ost.firstValue();
  const last = await ost.lastValue();
  const rootVal = await ost.treeRootNode();

  console.log('Root Count', rootCount.toString());
  console.log('First', first.toString());
  console.log('Last', last.toString());
  console.log('Root Value', rootVal.toString());
  console.groupEnd();

  // enumerate the node contents
  console.log(
    'Node Details, (crawled in order), value, parent, left, right, red, head, tail, orderCounter',
  );

  let n = first;
  while (parseInt(n) > 0) {
    let node = await ost.getNode(n);
    console.log(
      n,
      node[0].toString(),
      node[1].toString(),
      node[2].toString(),
      node[3],
      node[4].toString(),
      node[5].toString(),
      node[6].toString(),
    );
    n = await ost.nextValue(n);
    n = n.toString(10);
  }
}

async function loadScenario(steps: Step[]) {
  for (const step of steps) {
    const amount = step.amount;
    const orderId = step.orderId;
    const rate = step.rate;
    if (step.action == 'insert') {
      await ost.insertAmountValue(rate, orderId, constants.AddressZero, amount);
    } else if (step.action == 'delete') {
      await ost.removeAmountValue(rate, orderId);
    }
  }
}
