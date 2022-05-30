module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const markToMarket = await deploy('MarkToMarket', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed MarkToMarket at ' + markToMarket.address);
};

module.exports.tags = ['MarkToMarket'];
module.exports.dependencies = ['AddressResolver'];
