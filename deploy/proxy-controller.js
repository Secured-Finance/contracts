module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');
  const proxyController = await deploy('ProxyController', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed ProxyController at ' + proxyController.address);
};

module.exports.tags = ['ProxyController'];
module.exports.dependencies = ['AddressResolver'];
