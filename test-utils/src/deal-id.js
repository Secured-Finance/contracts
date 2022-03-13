const utils = require('web3-utils');

const generateId = (value, prefix) => {
  let right = utils.toBN(utils.rightPad(prefix, 64));
  let left = utils.toBN(utils.leftPad(value, 64));

  let id = utils.numberToHex(right.or(left));

  return id;
};

module.exports = {
  generateId,
};
