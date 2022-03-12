/**
 * Deploy and link libraries and contracts
 */

const DealId = artifacts.require('DealId');
const LoanV2 = artifacts.require('LoanV2');

module.exports = async function (deployer) {
  await deployer.deploy(DealId);
  await deployer.link(DealId, LoanV2);
  await deployer.deploy(LoanV2);
};
