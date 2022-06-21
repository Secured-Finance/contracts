module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const wETHToken = await deployments.get('WETH9Mock');

  const collateralVault = await deploy('CollateralVault', {
    from: deployer,
  });
  console.log('Deployed CollateralVault at ' + collateralVault.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setCollateralVaultImpl(collateralVault.address, wETHToken.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['CollateralVault'];
module.exports.dependencies = ['ProxyController', 'WETH'];
