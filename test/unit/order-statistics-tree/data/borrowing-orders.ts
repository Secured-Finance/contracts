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
        targetAmount: 50000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
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
        targetAmount: 50000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 400000000,
        droppedAmount: 400000000,
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
        title: 'Fill 1 node partially, Remove 1 order with a unfilled amount',
        targetAmount: 25000000,
        droppedAmount: 50000000,
      },
      {
        title:
          'Fill 1 node partially, Remove 1 order without a unfilled amount',
        targetAmount: 50000000,
        droppedAmount: 50000000,
      },
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 150000000,
        droppedAmount: 200000000,
      },
      {
        title:
          'Drop 1 node, Fill 1 node partially, Remove 2 order with a unfilled amount',
        targetAmount: 280000000,
        droppedAmount: 300000000,
      },
      {
        title:
          'Drop 1 node, Fill 1 node partially, Remove 2 order without a unfilled amount',
        targetAmount: 300000000,
        droppedAmount: 300000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 400000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes, Fill 1 node partially',
        targetAmount: 450000000,
        droppedAmount: 500000000,
      },
      {
        title:
          'Drop 2 nodes, Fill 1 node partially, Remove 3 order with a unfilled amount',
        targetAmount: 650000000,
        droppedAmount: 700000000,
      },
      {
        title:
          'Drop 2 nodes, Fill 1 node partially, Remove 3 order without a unfilled amount',
        targetAmount: 700000000,
        droppedAmount: 700000000,
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
        targetAmount: 1300000000,
        droppedAmount: 1600000000,
      },
      {
        title: 'Drop multiple nodes less than or equal to the root',
        targetAmount: 1600000000,
        droppedAmount: 1600000000,
      },
      {
        title: 'Drop multiple nodes across the root',
        targetAmount: 3000000000,
        droppedAmount: 4600000000,
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
        targetAmount: 100000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 200000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 400000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9801,
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
        targetAmount: 100000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 200000000,
        limitValue: 9800,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 400000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop 2 nodes by limitValue',
        targetAmount: 900000000,
        limitValue: 9801,
        droppedAmount: 400000000,
        droppedValue: 9801,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 900000000,
        limitValue: 9802,
        droppedAmount: 900000000,
        droppedValue: 9802,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 9802,
        droppedAmount: 900000000,
        droppedValue: 9802,
      },
    ],
  },
  {
    title: '3 discontinuous nodes in the tree',
    orders: [
      { unitPrice: 9800, orderId: 1, amount: 100000000 },
      { unitPrice: 9802, orderId: 2, amount: 300000000 },
      { unitPrice: 9804, orderId: 3, amount: 500000000 },
    ],
    inputs: [
      {
        title: 'Drop 1 node',
        targetAmount: 1000000000,
        limitValue: 9801,
        droppedAmount: 100000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        limitValue: 9803,
        droppedAmount: 400000000,
        droppedValue: 9800,
      },
      {
        title: 'Drop 2 node',
        targetAmount: 1000000000,
        limitValue: 9803,
        droppedAmount: 400000000,
        droppedValue: 9802,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 1000000000,
        limitValue: 9805,
        droppedAmount: 900000000,
        droppedValue: 9804,
      },
    ],
  },
];

export { borrowingMarketOrders, borrowingLimitOrders };
