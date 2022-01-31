const utils = require('web3-utils');

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = key => utils.rightPad(utils.asciiToHex(key), 64);
const fromBytes32 = key => utils.hexToAscii(key);

const hexFILString = toBytes32("FIL");
const hexETHString = toBytes32("ETH");
const hexBTCString = toBytes32("BTC");
const loanPrefix = "0x21aaa47b";
const loanName = "0xLoan";
const zeroAddress = '0x0000000000000000000000000000000000000000';
const ethTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

 module.exports = {
     toBytes32,
     fromBytes32,
     hexFILString, hexBTCString, hexETHString,
     loanPrefix, loanName,
     zeroAddress,
     ethTokenAddress,
 }