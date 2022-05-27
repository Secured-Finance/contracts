module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const collateralAggregator = await deploy('CollateralAggregatorV2', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log(
    'Deployed CollateralAggregatorV2 at ' + collateralAggregator.address,
  );
};

module.exports.tags = ['CollateralAggregator'];
module.exports.dependencies = ['AddressResolver'];
