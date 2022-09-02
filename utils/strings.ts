import * as utils from 'web3-utils';

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = (key) => utils.rightPad(utils.asciiToHex(key), 64);
const fromBytes32 = (key) => utils.hexToAscii(key);

const hexFILString = toBytes32('FIL');
const hexETHString = toBytes32('ETH');
const hexBTCString = toBytes32('BTC');
const hexUSDCString = toBytes32('USDC');

const zeroAddress = '0x0000000000000000000000000000000000000000';

const overflowErrorMsg =
  'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)';

export {
  toBytes32,
  fromBytes32,
  hexFILString,
  hexBTCString,
  hexETHString,
  zeroAddress,
  hexUSDCString,
  overflowErrorMsg,
};
