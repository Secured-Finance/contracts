const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ deployments, getNamedAccounts }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('CrosschainAddressResolver', {
    from: deployer,
  });

  await executeIfNewlyDeployment(
    'CrosschainAddressResolver',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      await proxyController
        .setCrosschainAddressResolverImpl(deployResult.address)
        .then((tx) => tx.wait());
    },
  );
};

module.exports.tags = ['CrosschainAddressResolver'];
module.exports.dependencies = ['ProxyController'];
