module.exports = async function ({ deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const crosschainResolver = await deploy('CrosschainAddressResolver', {
    from: deployer,
    args: [addressResolver.address],
  });

  console.log(
    'Deployed CrosschainAddressResolver at ' + crosschainResolver.address,
  );
};

module.exports.tags = ['CrosschainAddressResolver'];
module.exports.dependencies = ['AddressResolver'];
