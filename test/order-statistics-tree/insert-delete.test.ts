import { constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import { Step, steps } from './data/steps';
const OrderStatisticsTree = artifacts.require(
  'HitchensOrderStatisticsTreeContract.sol',
);

let ost: Contract;

describe('OrderStatisticsTree - insert and delete', () => {
  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  it('Insert all orders and delete after', async () => {
    console.log('Number of steps: ' + steps.length);
    let s = await loadScenario(steps);
    await printScenario(steps);
    await printExists(steps);
  });
});

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
