const { utils } = require('ethers');

const hashPosition = (year, month, day) => {
  let encodedPosition = utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [year.toString(), month.toString(), day.toString()],
  );

  return utils.keccak256(encodedPosition);
};

module.exports = {
  hashPosition,
};
