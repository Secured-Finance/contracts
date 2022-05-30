module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deploy('AddressResolver', {
    from: deployer,
  });
  console.log('Deployed AddressResolver at ' + addressResolver.address);
};

module.exports.tags = ['AddressResolver'];
