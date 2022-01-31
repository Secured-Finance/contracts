const utils = require('web3-utils');

const toEther = (wei) => {
    return utils.toWei(utils.toBN(wei), 'ether');
}

const toBN = (number) => {
    return utils.toBN(number);
}

const ETH = utils.toBN("1000000000000000000");
const ZERO_BN = utils.toBN("0");
const decimalBase = utils.toBN("1000000000000000000");
const IR_BASE = toBN('10000');

const filToETHRate = web3.utils.toBN("67175250000000000");
const ethToUSDRate = web3.utils.toBN("232612637168");
const btcToETHRate = web3.utils.toBN("23889912590000000000");

module.exports = {
    toEther,
    toBN,
    ETH,
    ZERO_BN,
    decimalBase,
    IR_BASE,
    filToETHRate,
    ethToUSDRate,
    btcToETHRate,
}