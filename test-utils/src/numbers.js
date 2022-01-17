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

module.exports = {
    toEther,
    toBN,
    ETH,
    ZERO_BN,
    decimalBase
}