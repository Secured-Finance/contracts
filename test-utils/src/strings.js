const utils = require('web3-utils');

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = (key) => utils.rightPad(utils.asciiToHex(key), 64);
const fromBytes32 = (key) => utils.hexToAscii(key);

const hexFILString = toBytes32('FIL');
const hexETHString = toBytes32('ETH');
const hexBTCString = toBytes32('BTC');
const hexUSDCString = toBytes32('USDC');
const loanPrefix = '0x21aaa47b';
const loanName = '0xLoan';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const ethTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const aliceFILAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';
const bobFILAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpafsfalcvty';

const testCcy = toBytes32('0xTestCcy');
const testJobId = toBytes32('0xTestJobId');
const testTxHash = toBytes32('0xTestTxHash');
const secondTxHash = toBytes32('0xSecondTxHash');
const thirdTxHash = toBytes32('0xThirdTxHash');

module.exports = {
  toBytes32,
  fromBytes32,
  hexFILString,
  hexBTCString,
  hexETHString,
  loanPrefix,
  loanName,
  zeroAddress,
  ethTokenAddress,
  hexUSDCString,
  aliceFILAddress,
  bobFILAddress,
  testCcy,
  testJobId,
  testTxHash,
  secondTxHash,
  thirdTxHash,
};
