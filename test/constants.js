const Side = {
  LEND: 0,
  BORROW: 1,
};

const Ccy = {
  ETH: 0,
  FIL: 1,
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
  MoneyMarket: {
    ccy: 1,
    lenders: [
      [0, 100000, 400],
      [1, 110000, 500],
      [2, 120000, 700],
      [3, 130000, 800],
      [4, 140000, 900],
      [5, 150000, 1000],
    ],
    borrowers: [
      [0, 100000, 300],
      [1, 110000, 400],
      [2, 120000, 600],
      [3, 130000, 700],
      [4, 140000, 800],
      [5, 150000, 900],
    ],
    // lenders: [
    //   // [term, amt, rate] (1% = 100bps)
    //   [0, 100000, 500], // [_3m, 100000FIL, 500bps is 5%]
    //   [1, 110000, 600], // [_6m, 110000FIL, 600bps is 6%]
    //   [2, 120000, 900],
    //   [3, 130000, 1200],
    //   [4, 140000, 1500],
    //   [5, 150000, 1800], // [_5y, 150000FIL, 1800bps is 18%]
    // ],
    // borrowers: [
    //   [0, 100000, 400], // [_3m, 100000FIL, 400bps is 4%]
    //   [1, 110000, 500], // [_6m, 110000FIL, 500bps is 5%]
    //   [2, 120000, 800],
    //   [3, 130000, 1000],
    //   [4, 140000, 1300],
    //   [5, 150000, 1600], // [_5y, 150000FIL, 1600bps is 16%]
    // ],
    effectiveSec: 36000, // 10 hrs
  },
  FXMarket: {
    pair: 0, // FILETH
    offerInput: [0, 1, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
    bidInput: [1, 0, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
    effectiveSec: 36000,
  },
  Collateral: [
    {
      id: 'did:sample_0',
      addrFIL: 'cid_FIL_0',
    },
    {
      id: 'did:sample_1',
      addrFIL: 'cid_FIL_1',
    },
    {
      id: 'did:sample_2',
      addrFIL: 'cid_FIL_2',
    },
  ],
  Loan: {
    // makerAddr: accounts[0],
    // side: 1, // BORROW
    side: 0, // LEND
    ccy: 1, // FIL
    term: 5, // _5y
    amt: 150000 - 9999,
  },
};

module.exports = {
  Side,
  Ccy,
  Term,
  sample
};
