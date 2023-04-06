import { utils } from 'ethers';

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = (key) => utils.formatBytes32String(key);
const fromBytes32 = (key) => utils.parseBytes32String(key);

const hexWFIL = toBytes32('WFIL');
const hexEFIL = toBytes32('EFIL');
const hexETH = toBytes32('ETH');
const hexWBTC = toBytes32('WBTC');
const hexUSDC = toBytes32('USDC');

export { toBytes32, fromBytes32, hexWFIL, hexEFIL, hexWBTC, hexETH, hexUSDC };
