module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const liquidations = await deploy('Liquidations', {
    from: deployer,
    args: [addressResolver.address, 10],
  });
  console.log('Deployed Liquidations at ' + liquidations.address);
};

module.exports.tags = ['Liquidations'];
module.exports.dependencies = ['AddressResolver'];
