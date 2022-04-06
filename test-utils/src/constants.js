const Side = {
  LEND: 0,
  BORROW: 1,
};

const Ccy = {
  ETH: 0,
  FIL: 1,
  USDC: 2,
  BTC: 3,
};

const CcyPair = {
  FILETH: 0,
  FILUSDC: 1,
  ETHUSDC: 2,
};

const Term = {
  _3m: 0,
  _6m: 1,
  _1y: 2,
  _2y: 3,
  _3y: 4,
  _5y: 5,
};

const LoanState = {
  REGISTERED: 0,
  WORKING: 1,
  DUE: 2,
  PAST_DUE: 3,
  CLOSED: 4,
  TERMINATED: 5,
};

const ColState = {
  EMPTY: 0,
  AVAILABLE: 1,
  IN_USE: 2,
  MARGIN_CALL: 3,
  LIQUIDATION_IN_PROGRESS: 4,
  LIQUIDATION: 5,
};

const effectiveSec = 60 * 60 * 24 * 14; // 14 days

const sample = {
  MoneyMarket: [
    {
      ccy: Ccy.ETH,
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
      effectiveSec,
    },
    {
      ccy: Ccy.FIL,
      lenders: [
        [0, 10000, 900],
        [1, 11000, 1000],
        [2, 12000, 1100],
        [3, 13000, 1200],
        [4, 14000, 1300],
        [5, 15000, 1500],
      ],
      borrowers: [
        [0, 10000, 700],
        [1, 11000, 800],
        [2, 12000, 900],
        [3, 13000, 1000],
        [4, 14000, 1100],
        [5, 15000, 1300],
      ],
      effectiveSec,
    },
    {
      ccy: Ccy.FIL,
      lenders: [
        [0, 20000, 910],
        [1, 21000, 1010],
        [2, 22000, 1110],
        [3, 23000, 1210],
        [4, 24000, 1310],
        [5, 25000, 1510],
      ],
      borrowers: [
        [0, 20000, 690],
        [1, 21000, 790],
        [2, 22000, 890],
        [3, 23000, 990],
        [4, 24000, 1090],
        [5, 25000, 1290],
      ],
      effectiveSec,
    },
    {
      ccy: Ccy.FIL,
      lenders: [
        [0, 30000, 920],
        [1, 31000, 1020],
        [2, 32000, 1120],
        [3, 33000, 1220],
        [4, 34000, 1320],
        [5, 35000, 1520],
      ],
      borrowers: [
        [0, 30000, 680],
        [1, 31000, 780],
        [2, 32000, 880],
        [3, 33000, 980],
        [4, 34000, 1080],
        [5, 35000, 1280],
      ],
      effectiveSec,
    },
    {
      ccy: Ccy.USDC,
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
      effectiveSec,
    },
  ],
  FXMarket: [
    {
      pair: CcyPair.FILETH,
      offerInput: [Ccy.ETH, Ccy.FIL, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
      bidInput: [Ccy.FIL, Ccy.ETH, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
      effectiveSec: 36000,
    },
    {
      pair: CcyPair.FILUSDC,
      offerInput: [Ccy.FIL, Ccy.USDC, 100000, 5000000], // [FIL, USDC, 100000FIL, 5000000USDC]
      bidInput: [Ccy.USDC, Ccy.FIL, 3000000, 100000], // [USDC, FIL, 3000000USDC, 100000FIL]
      effectiveSec: 36000,
    },
    {
      pair: CcyPair.ETHUSDC,
      offerInput: [Ccy.USDC, Ccy.ETH, 5000000, 10000], // [USDC, ETH, 5000000USDC, 10000ETH]
      bidInput: [Ccy.ETH, Ccy.USDC, 10000, 3000000], // [ETH, USDC, 10000ETH, 3000000USDC]
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
      side: Side.LEND,
      ccy: Ccy.FIL,
      term: Term._5y,
      amt: 10000,
    },
    {
      side: Side.BORROW,
      ccy: Ccy.USDC,
      term: Term._5y,
      amt: 400000,
    },
    {
      side: Side.LEND,
      ccy: Ccy.FIL,
      term: Term._5y,
      amt: 1000,
    },
  ],
  OrderBook: [
    {
      ccy: Ccy.FIL,
      orders: [
        [0, 10000, 375, effectiveSec],
        [1, 2000, 710, effectiveSec],
      ],
    },
  ],
};

module.exports = {
  Side,
  Ccy,
  CcyPair,
  Term,
  LoanState,
  ColState,
  sample,
  GANACHE_PROVIDER: 'http://127.0.0.1:9545',
};
