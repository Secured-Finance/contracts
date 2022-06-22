const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('MarkToMarket', {
    from: deployer,
  });

  await executeIfNewlyDeployment('MarkToMarket', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setMarkToMarketImpl(deployResult.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['MarkToMarket'];
module.exports.dependencies = ['ProxyController'];
