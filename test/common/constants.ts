import { BigNumber } from 'ethers';

export const LIQUIDATION_THRESHOLD_RATE = 12500;
export const INITIAL_COMPOUND_FACTOR = '1010000000000000000';
// NOTE: To calculate GV, the 2 steps are required at most such as "Orders -> FV -> GV".
// Then, a maximum of 3 steps are required to calculate the target FV and PV from that GV.
// Each step may involve truncation of values, so a maximum of three errors may occur.
export const ORDERS_CALCULATION_TOLERANCE_RANGE = 3;

export const filToETHRate = BigNumber.from('3803677700000000');
export const ethToUSDRate = BigNumber.from('149164000000');
export const btcToETHRate = BigNumber.from('13087292239235700000');
export const usdcToETHRate = BigNumber.from('670403046311442');
