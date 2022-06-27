const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('Liquidations', { from: deployer });

  await executeIfNewlyDeployment('Liquidations', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setLiquidationsImpl(deployResult.address, 10)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['Liquidations'];
module.exports.dependencies = ['ProxyController'];
