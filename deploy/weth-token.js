const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('WETH9Mock', { from: deployer });
  await executeIfNewlyDeployment('WETH9Mock', deployResult);
};

module.exports.tags = ['WETH'];
