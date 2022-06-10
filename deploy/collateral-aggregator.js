module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const collateralAggregator = await deploy('CollateralAggregatorV2', {
    from: deployer,
  });
  console.log(
    'Deployed CollateralAggregatorV2 at ' + collateralAggregator.address,
  );

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const tx = await proxyController.setCollateralAggregatorImpl(
    collateralAggregator.address,
  );
  await tx.wait();
};

module.exports.tags = ['CollateralAggregator'];
module.exports.dependencies = ['ProxyController'];
