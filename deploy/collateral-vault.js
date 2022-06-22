const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const wETHToken = await deployments.get('WETH9Mock');
  const deployResult = await deploy('CollateralVault', {
    from: deployer,
  });

  await executeIfNewlyDeployment('CollateralVault', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setCollateralVaultImpl(deployResult.address, wETHToken.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['CollateralVault'];
module.exports.dependencies = ['ProxyController', 'WETH'];
