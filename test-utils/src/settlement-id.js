const { utils } = require('ethers');

const computeNativeSettlementId = (
  address0,
  address1,
  ccy,
  payment,
  slotTime,
) => {
  return utils.solidityKeccak256(
    ['address', 'address', 'bytes32', 'uint256', 'uint256'],
    [address0, address1, ccy, payment.toString(), slotTime.toString()],
  );
};

const computeCrosschainSettlementId = (txHash) => {
  return utils.solidityKeccak256(['string'], [txHash]);
};

module.exports = {
  computeNativeSettlementId,
  computeCrosschainSettlementId,
};
