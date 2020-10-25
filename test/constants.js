const Side = {
  LEND: 0,
  BORROW: 1,
};

const Ccy = {
  ETH: 0,
  FIL: 1,
  USDC: 2,
};

const Term = {
  _3m: 0,
  _6m: 1,
  _1y: 2,
  _2y: 3,
  _3y: 4,
  _5y: 5,
};

const sample = {
  MoneyMarket: [
    {
      ccy: 0,
      lenders: [
        [0, 100, 200],
        [1, 110, 300],
        [2, 120, 400],
        [3, 130, 600],
        [4, 140, 700],
        [5, 150, 800],
      ],
      borrowers: [
        [0, 100, 100],
        [1, 110, 200],
        [2, 120, 300],
        [3, 130, 500],
        [4, 140, 600],
        [5, 150, 700],
      ],
      effectiveSec: 36000, // 10 hrs
    },
    {
      ccy: 1,
      lenders: [
        [0, 10000, 400],
        [1, 11000, 500],
        [2, 12000, 700],
        [3, 13000, 800],
        [4, 14000, 900],
        [5, 15000, 1000],
      ],
      borrowers: [
        [0, 10000, 300],
        [1, 11000, 400],
        [2, 12000, 600],
        [3, 13000, 700],
        [4, 14000, 800],
        [5, 15000, 900],
      ],
      effectiveSec: 36000, // 10 hrs
    },
    {
      ccy: 2,
      lenders: [
        [0, 1000000, 40],
        [1, 1100000, 50],
        [2, 1200000, 70],
        [3, 1300000, 80],
        [4, 1400000, 90],
        [5, 1500000, 100],
      ],
      borrowers: [
        [0, 1000000, 30],
        [1, 1100000, 40],
        [2, 1200000, 60],
        [3, 1300000, 70],
        [4, 1400000, 80],
        [5, 1500000, 90],
      ],
      effectiveSec: 36000, // 10 hrs
    },
  ],
  FXMarket: [
    {
      pair: 0, // FILETH
      offerInput: [0, 1, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
      bidInput: [1, 0, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
      effectiveSec: 36000,
    },
    {
      pair: 1, // FILUSDC
      offerInput: [1, 2, 100000, 5000000], // [FIL, USDC, 100000FIL, 5000000USDC]
      bidInput: [2, 1, 3000000, 100000], // [USDC, FIL, 3000000USDC, 100000FIL]
      effectiveSec: 36000,
    },
    {
      pair: 2, // ETHUSDC
      offerInput: [2, 1, 5000000, 10000], // [USDC, ETH, 5000000USDC, 10000ETH]
      bidInput: [1, 2, 10000, 3000000], // [ETH, USDC, 10000ETH, 3000000USDC]
      effectiveSec: 36000,
    },
  ],
  Collateral: [
    {
      id: 'did:sample_0',
      addrFIL: 'cid_FIL_0',
      addrUSDC: '0xa9ed07f9bf5bd15804dfd95c5709c0ccc102b221',
    },
    {
      id: 'did:sample_1',
      addrFIL: 'cid_FIL_1',
      addrUSDC: '0xcb6ba40812a2421ae8bafd1459b0b71cc070f0c8',
    },
    {
      id: 'did:sample_2',
      addrFIL: 'cid_FIL_2',
      addrUSDC: '0x9188b1e31bc6190afcd893e614a38c704c33c640',
    },
  ],
  Loan: [
    {
      side: 0, // LEND
      ccy: 1, // FIL
      term: 5, // 5y
      amt: 10000,
      // amt: 15000 - 999,
    },
    {
      side: 1, // BORROW
      ccy: 2, // USDC
      term: 5, // 5y
      amt: 400000,
      // amt: 1000000,
    },
    {
      side: 1, // BORROW
      ccy: 1, // FIL
      term: 0, // 3m
      amt: 10000,
    },
  ],
};

module.exports = {
  Side,
  Ccy,
  Term,
  sample
};
