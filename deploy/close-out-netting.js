const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('CloseOutNetting', { from: deployer });

  await executeIfNewlyDeployment('CloseOutNetting', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setCloseOutNettingImpl(deployResult.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['CloseOutNetting'];
module.exports.dependencies = ['ProxyController'];
