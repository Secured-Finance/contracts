import { Condition } from '../drop.test';

const borrowingMarketOrders: Condition[] = [
  {
    title: '1 nodes in the tree',
    orders: [{ unitPrice: 9800, orderId: 1, amount: 100000000 }],
    inputs: [
      {
        title: 'Fill 1 node partially',
        targetAmount: 50000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 100000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop all nodes using an exceeding amount',
        targetAmount: 1000000000,
        droppedAmount: 100000000,
      },
    ],
  },
  {
    title: '2 nodes in the tree',
    orders: [
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9801, orderId: 2, amount: 300000000 },
    ],
    inputs: [
      {
        title: 'Fill 1 node partially',
        targetAmount: 100000000,
        droppedAmount: 300000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 300000000,
        droppedAmount: 300000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 350000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 400000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop all nodes using an exceeding amount',
        targetAmount: 1000000000,
        droppedAmount: 400000000,
      },
    ],
  },
  {
    title: '3 nodes in the tree',
    orders: [
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9801, orderId: 2, amount: 300000000 },
      { unitPrice: 9802, orderId: 3, amount: 500000000 },
    ],
    inputs: [
      {
        title: 'Fill 1 node partially',
        targetAmount: 300000000,
        droppedAmount: 500000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 500000000,
        droppedAmount: 500000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 600000000,
        droppedAmount: 800000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 800000000,
        droppedAmount: 800000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 900000000,
        droppedAmount: 900000000,
      },
      {
        title: 'Drop all nodes using an exceeding amount',
        targetAmount: 1000000000,
        droppedAmount: 900000000,
      },
    ],
  },
  {
    title: '3 nodes with multiple orders in the tree',
    orders: [
      { unitPrice: 9800, orderId: 11, amount: 50000000 },
      { unitPrice: 9800, orderId: 12, amount: 50000000 },
      { unitPrice: 9801, orderId: 21, amount: 100000000 },
      { unitPrice: 9801, orderId: 22, amount: 100000000 },
      { unitPrice: 9801, orderId: 23, amount: 100000000 },
      { unitPrice: 9802, orderId: 31, amount: 100000000 },
      { unitPrice: 9802, orderId: 32, amount: 100000000 },
      { unitPrice: 9802, orderId: 33, amount: 100000000 },
      { unitPrice: 9802, orderId: 34, amount: 100000000 },
      { unitPrice: 9802, orderId: 35, amount: 100000000 },
    ],
    inputs: [
      {
        title: 'Fill 1 node partially, Remove 4 order with a unfilled amount',
        targetAmount: 350000000,
        droppedAmount: 400000000,
      },
      {
        title:
          'Fill 1 node partially, Remove 4 order without a unfilled amount',
        targetAmount: 400000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 500000000,
        droppedAmount: 500000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 600000000,
        droppedAmount: 600000000,
      },
      {
        title:
          'Drop 1 node, Fill 1 node partially, Remove 2 order with a unfilled amount',
        targetAmount: 620000000,
        droppedAmount: 700000000,
      },
      {
        title:
          'Drop 1 node, Fill 1 node partially, Remove 2 order without a unfilled amount',
        targetAmount: 700000000,
        droppedAmount: 700000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 800000000,
        droppedAmount: 800000000,
      },
      {
        title: 'Drop 2 nodes, Fill 1 node partially',
        targetAmount: 820000000,
        droppedAmount: 850000000,
      },
      {
        title:
          'Drop 2 nodes, Fill 1 node partially, Remove 1 order with a unfilled amount',
        targetAmount: 830000000,
        droppedAmount: 850000000,
      },
      {
        title:
          'Drop 2 nodes, Fill 1 node partially, Remove 1 order without a unfilled amount',
        targetAmount: 850000000,
        droppedAmount: 850000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 900000000,
        droppedAmount: 900000000,
      },
      {
        title: 'Drop all nodes using an exceeding amount',
        targetAmount: 1000000000,
        droppedAmount: 900000000,
      },
    ],
  },
  {
    title: 'Many nodes in the tree',
    orders: [
      { unitPrice: 9809, orderId: 101, amount: 100000000 },
      { unitPrice: 9809, orderId: 102, amount: 100000000 },
      { unitPrice: 9809, orderId: 103, amount: 100000000 },
      { unitPrice: 9810, orderId: 12, amount: 100000000 },
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9801, orderId: 21, amount: 100000000 },
      { unitPrice: 9801, orderId: 22, amount: 100000000 },
      { unitPrice: 9801, orderId: 23, amount: 100000000 },
      { unitPrice: 9802, orderId: 3, amount: 500000000 },
      { unitPrice: 9803, orderId: 4, amount: 700000000 },
      { unitPrice: 9807, orderId: 82, amount: 350000000 },
      { unitPrice: 9807, orderId: 83, amount: 350000000 },
      { unitPrice: 9804, orderId: 5, amount: 1300000000 },
      { unitPrice: 9805, orderId: 6, amount: 1700000000 },
      { unitPrice: 9806, orderId: 7, amount: 1300000000 },
      { unitPrice: 9808, orderId: 9, amount: 500000000 },
    ],
    inputs: [
      {
        title: 'Fill 1 node partially',
        targetAmount: 50000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop multiple nodes less than the root',
        targetAmount: 400000000,
        droppedAmount: 400000000,
      },
      {
        title:
          'Drop multiple nodes less than the root, Fill root node partially',
        targetAmount: 6000000000,
        droppedAmount: 6600000000,
      },
      {
        title: 'Drop multiple nodes less than or equal to the root',
        targetAmount: 6600000000,
        droppedAmount: 6600000000,
      },
      {
        title: 'Drop multiple nodes across the root',
        targetAmount: 7000000000,
        droppedAmount: 7100000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 7500000000,
        droppedAmount: 7500000000,
      },
      {
        title: 'Drop all nodes using an exceeding amount',
        targetAmount: 10000000000,
        droppedAmount: 7500000000,
      },
    ],
  },
];

const borrowingLimitOrders: Condition[] = [
  {
    title: '1 nodes in the tree',
    orders: [{ unitPrice: 9800, orderId: 1, amount: 100000000 }],
    inputs: [
      {
        title: 'Drop all nodes',
        targetAmount: 100000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 200000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
    ],
  },
  {
    title: '2 nodes in the tree',
    orders: [
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9801, orderId: 2, amount: 300000000 },
    ],
    inputs: [
      {
        title: 'Drop 1 node',
        targetAmount: 300000000,
        limitValue: 9801,
        droppedAmount: 300000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 350000000,
        limitValue: 9801,
        droppedAmount: 300000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 350000000,
        limitValue: 9800,
        droppedAmount: 400000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 400000000,
        limitValue: 9800,
        droppedAmount: 400000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 9800,
        droppedAmount: 400000000,
        droppedValue: 9800,
      },
    ],
  },
  {
    title: '3 nodes in the tree',
    orders: [
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9801, orderId: 2, amount: 300000000 },
      { unitPrice: 9802, orderId: 3, amount: 500000000 },
    ],
    inputs: [
      {
        title: 'Drop 1 node',
        targetAmount: 500000000,
        limitValue: 9802,
        droppedAmount: 500000000,
        droppedValue: 9802,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 600000000,
        limitValue: 9802,
        droppedAmount: 500000000,
        droppedValue: 9802,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 600000000,
        limitValue: 9801,
        droppedAmount: 800000000,
        droppedValue: 9802,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 800000000,
        limitValue: 9801,
        droppedAmount: 800000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop 2 nodes by limitValue',
        targetAmount: 900000000,
        limitValue: 9801,
        droppedAmount: 800000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 900000000,
        limitValue: 9800,
        droppedAmount: 900000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 9800,
        droppedAmount: 900000000,
        droppedValue: 9800,
      },
    ],
  },
];

export { borrowingMarketOrders, borrowingLimitOrders };
