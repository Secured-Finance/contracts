module.exports = async function ({ deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const crosschainResolver = await deploy('CrosschainAddressResolver', {
    from: deployer,
  });
  console.log(
    'Deployed CrosschainAddressResolver at ' + crosschainResolver.address,
  );

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setCrosschainAddressResolverImpl(crosschainResolver.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['CrosschainAddressResolver'];
module.exports.dependencies = ['ProxyController'];
