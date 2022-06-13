module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const liquidations = await deploy('Liquidations', { from: deployer });
  console.log('Deployed Liquidations at ' + liquidations.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setLiquidationsImpl(liquidations.address, 10)
    .then((tx) => tx.wait());
};

module.exports.tags = ['Liquidations'];
module.exports.dependencies = ['ProxyController'];
