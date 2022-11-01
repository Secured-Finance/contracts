interface Order {
  rate: number;
  orderId: number;
  amount: number;
}

interface Condition {
  title: string;
  orders: Order[];
  inputs: {
    title: string;
    targetAmount: number;
    droppedAmount: number;
    limitValue?: number;
  }[];
}

const lendingMarketOrders: Condition[] = [
  {
    title: '1 nodes in the tree',
    orders: [{ rate: 8000, orderId: 1, amount: 100000000 }],
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
      { rate: 8000, orderId: 1, amount: 100000000 },
      { rate: 8001, orderId: 2, amount: 300000000 },
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
      { rate: 8000, orderId: 1, amount: 100000000 },
      { rate: 8001, orderId: 2, amount: 300000000 },
      { rate: 8002, orderId: 3, amount: 500000000 },
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
      { rate: 8000, orderId: 12, amount: 50000000 },
      { rate: 8000, orderId: 13, amount: 50000000 },
      { rate: 8001, orderId: 21, amount: 150000000 },
      { rate: 8001, orderId: 22, amount: 150000000 },
      { rate: 8002, orderId: 31, amount: 250000000 },
      { rate: 8002, orderId: 32, amount: 250000000 },
    ],
    inputs: [
      {
        title: 'Fill 1 node partially',
        targetAmount: 25000000,
        droppedAmount: 50000000,
      },
      {
        title: 'Fill 1 node partially, Remove 1 order id',
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
        targetAmount: 200000000,
        droppedAmount: 250000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially, Remove 1 order id',
        targetAmount: 280000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 400000000,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes, Fill 1 node partially',
        targetAmount: 450000000,
        droppedAmount: 650000000,
      },
      {
        title: 'Drop 2 nodes, Fill 1 node partially, Remove 1 order id',
        targetAmount: 650000000,
        droppedAmount: 650000000,
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
      { rate: 8009, orderId: 101, amount: 100000000 },
      { rate: 8009, orderId: 102, amount: 100000000 },
      { rate: 8009, orderId: 103, amount: 100000000 },
      { rate: 8010, orderId: 12, amount: 100000000 },
      { rate: 8000, orderId: 1, amount: 100000000 },
      { rate: 8001, orderId: 21, amount: 100000000 },
      { rate: 8001, orderId: 22, amount: 100000000 },
      { rate: 8001, orderId: 23, amount: 100000000 },
      { rate: 8002, orderId: 3, amount: 500000000 },
      { rate: 8003, orderId: 4, amount: 700000000 },
      { rate: 8007, orderId: 82, amount: 350000000 },
      { rate: 8007, orderId: 83, amount: 350000000 },
      { rate: 8004, orderId: 5, amount: 1300000000 },
      { rate: 8005, orderId: 6, amount: 1700000000 },
      { rate: 8006, orderId: 7, amount: 1300000000 },
      { rate: 8008, orderId: 9, amount: 500000000 },
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

const lendingLimitOrders: Condition[] = [
  {
    title: '1 nodes in the tree',
    orders: [{ rate: 8000, orderId: 1, amount: 100000000 }],
    inputs: [
      {
        title: 'Drop all nodes',
        targetAmount: 100000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 200000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
    ],
  },
  {
    title: '2 nodes in the tree',
    orders: [
      { rate: 8000, orderId: 1, amount: 100000000 },
      { rate: 8001, orderId: 2, amount: 300000000 },
    ],
    inputs: [
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 200000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 400000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
    ],
  },
  {
    title: '3 nodes in the tree',
    orders: [
      { rate: 8000, orderId: 1, amount: 100000000 },
      { rate: 8001, orderId: 2, amount: 300000000 },
      { rate: 8002, orderId: 3, amount: 500000000 },
    ],
    inputs: [
      {
        title: 'Drop 1 node',
        targetAmount: 100000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node by limitValue',
        targetAmount: 200000000,
        limitValue: 8000,
        droppedAmount: 100000000,
      },
      {
        title: 'Drop 1 node, Fill 1 node partially',
        targetAmount: 200000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes',
        targetAmount: 400000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop 2 nodes by limitValue',
        targetAmount: 900000000,
        limitValue: 8001,
        droppedAmount: 400000000,
      },
      {
        title: 'Drop all nodes',
        targetAmount: 900000000,
        limitValue: 8002,
        droppedAmount: 900000000,
      },
      {
        title: 'Drop all nodes by limitValue',
        targetAmount: 1000000000,
        limitValue: 8002,
        droppedAmount: 900000000,
      },
    ],
  },
];

export { lendingMarketOrders, lendingLimitOrders };
