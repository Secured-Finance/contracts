import { BigNumber } from 'ethers';

export const ORDER_FEE_RATE = 100;
export const CIRCUIT_BREAKER_LIMIT_RANGE = 1000;
export const LIQUIDATION_THRESHOLD_RATE = 12500;
export const LIQUIDATION_PROTOCOL_FEE_RATE = 200;
export const LIQUIDATOR_FEE_RATE = 500;
export const INITIAL_COMPOUND_FACTOR = '1000000000000000000';
export const MARKET_BASE_PERIOD = 3;
export const HAIRCUT = 8000;

export const wFilToETHRate = BigNumber.from('3803677700000000');
export const eFilToETHRate = BigNumber.from('3803677700000000');
export const btcToETHRate = BigNumber.from('13087292239235700000');
export const usdcToETHRate = BigNumber.from('670403046311442');
export const wBtcToBTCRate = BigNumber.from('100100000');

export const SECONDS_IN_YEAR = 31536000;
export const PRICE_DIGIT = 10000;
export const PCT_DIGIT = 10000;
