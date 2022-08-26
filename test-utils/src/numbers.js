const utils = require('web3-utils');
const ethers = require('ethers');

const toEther = (ether) => {
  return utils.toWei(utils.toBN(ether), 'ether');
};

const toBN = (number) => {
  return utils.toBN(number);
};

const fromWeiToEther = (wei) => {
  return ethers.utils.formatEther(wei);
};

const ETH = utils.toBN('1000000000000000000');
const ZERO_BN = utils.toBN('0');
const decimalBase = utils.toBN('1000000000000000000');
const IR_BASE = toBN('10000');

const filToETHRate = web3.utils.toBN('67175250000000000');
const ethToUSDRate = web3.utils.toBN('232612637168');
const btcToETHRate = web3.utils.toBN('23889912590000000000');
const usdcToUSDRate = web3.utils.toBN('100000000000');

module.exports = {
  toEther,
  toBN,
  fromWeiToEther,
  ETH,
  ZERO_BN,
  decimalBase,
  IR_BASE,
  filToETHRate,
  ethToUSDRate,
  btcToETHRate,
  usdcToUSDRate,
};
