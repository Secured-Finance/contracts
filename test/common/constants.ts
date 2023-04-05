import { BigNumber } from 'ethers';

export const ORDER_FEE_RATE = 100;
export const AUTO_ROLL_FEE_RATE = 250;
export const LIQUIDATION_THRESHOLD_RATE = 12500;
export const LIQUIDATION_PROTOCOL_FEE_RATE = 200;
export const LIQUIDATOR_FEE_RATE = 500;
export const INITIAL_COMPOUND_FACTOR = '1000000000000000000';
export const MARKET_BASE_PERIOD = 3;
export const MARKET_OBSERVATION_PERIOD = 21600;

export const wFilToETHRate = BigNumber.from('3803677700000000');
export const eFilToETHRate = BigNumber.from('3803677700000000');
export const ethToUSDRate = BigNumber.from('149164000000');
export const wBtcToETHRate = BigNumber.from('13087292239235700000');
export const usdcToETHRate = BigNumber.from('670403046311442');

export const SECONDS_IN_YEAR = 31536000;
export const PRICE_DIGIT = 10000;
export const PCT_DIGIT = 10000;
