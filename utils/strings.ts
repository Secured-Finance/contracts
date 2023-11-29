import { utils } from 'ethers';

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = (key) => utils.formatBytes32String(key);
const fromBytes32 = (key) => utils.parseBytes32String(key);

const hexWFIL = toBytes32('WFIL');
const hexETH = toBytes32('ETH');
const hexWETH = toBytes32('WETH');
const hexWBTC = toBytes32('WBTC');
const hexUSDC = toBytes32('USDC');

export { fromBytes32, hexETH, hexUSDC, hexWBTC, hexWETH, hexWFIL, toBytes32 };
