const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('SettlementEngine', {
    from: deployer,
  });

  await executeIfNewlyDeployment('SettlementEngine', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    const wETHToken = await deployments.get('WETH9Mock');

    await proxyController
      .setSettlementEngineImpl(deployResult.address, wETHToken.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['SettlementEngine'];
module.exports.dependencies = ['ProxyController', 'WETH'];
