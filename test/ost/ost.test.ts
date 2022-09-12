import { artifacts, ethers } from 'hardhat';
import { steps } from './steps';
const OrderStatisticsTree = artifacts.require(
  'HitchensOrderStatisticsTreeContract.sol',
);

let ost: any;

describe('OrderStatisticsTree - sort and rank', () => {
  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    ost = await OrderStatisticsTree.new();
  });

  it('should insert all orders and delete after', async () => {
    console.log('Number of steps: ' + steps.length);
    let s = await loadScenario(steps);
    await printScenario(steps);
    await printExists(steps);
  });
});

async function printExists(s: any) {
  console.log();
  console.log('See if values exists');
  console.group('value, exists');

  for (let i = 0; i < s.length; i++) {
    let element = s[i]['rate'];
    if (element > 0) {
      const exists = await ost.valueExists(element);
      console.log(element, exists);
    }
  }
  console.groupEnd();
}

async function printScenario(s: any) {
  let first;
  let last;
  let rootVal;
  let n;
  let node;
  let orderCount;

  // enumerate the sorted list and stats
  console.group('element, orderCount');
  for (let i = 0; i < s.length; i++) {
    let element = s[i]['rate'];
    orderCount = await ost.getValueCount(element);
    console.log(element, orderCount.toString(10));
  }
  console.groupEnd();

  // tree structure summary
  console.group('Tree Properties');
  let rootCount = await ost.getRootCount();
  first = await ost.firstValue();
  last = await ost.lastValue();
  rootVal = await ost.treeRootNode();

  rootCount = rootCount.toString(10);
  first = first.toString(10);
  last = last.toString(10);
  rootVal = rootVal.toString(10);

  console.log('Root Count', rootCount);
  console.log('First', first);
  console.log('Last', last);
  console.log('Root Value', rootVal);
  console.groupEnd();

  // enumerate the node contents
  console.log(
    'Node Details, (crawled in order), value, parent, left, right, red, head, tail, orderCounter',
  );

  n = first;
  while (parseInt(n) > 0) {
    node = await ost.getNode(n);
    console.log(
      n,
      node[0].toString(10),
      node[1].toString(10),
      node[2].toString(10),
      node[3],
      node[4].toString(10),
      node[5].toString(10),
      node[6].toString(10),
    );
    n = await ost.nextValue(n);
    n = n.toString(10);
  }
}

async function loadScenario(steps: any[]) {
  let amount;

  for (let i = 0; i < steps.length; i++) {
    amount = steps[i]['amount'];
    const orderId = steps[i]['orderId'];
    const rate = steps[i]['rate'];
    if (steps[i]['action'] == 'insert') {
      await ost.insertAmountValue(amount, rate, orderId);
    } else if (steps[i]['action'] == 'delete') {
      await ost.removeAmountValue(amount, rate, orderId);
    }
  }
}
