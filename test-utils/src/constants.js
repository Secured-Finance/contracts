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

const ColState = {
  EMPTY: 0,
  AVAILABLE: 1,
  IN_USE: 2,
  MARGIN_CALL: 3,
  LIQUIDATION_IN_PROGRESS: 4,
  LIQUIDATION: 5,
};

module.exports = {
  Side,
  Ccy,
  ColState,
};
