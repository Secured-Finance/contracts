const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const deployResult = await deploy('ProductAddressResolver', {
    from: deployer,
    libraries: {
      DealId: dealIdLibrary.address,
    },
  });

  await executeIfNewlyDeployment(
    'ProductAddressResolver',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      await proxyController
        .setProductAddressResolverImpl(deployResult.address)
        .then((tx) => tx.wait());
    },
  );
};

module.exports.tags = ['ProductAddressResolver'];
module.exports.dependencies = [
  'Libraries',
  'Loan',
  'LendingMarketController',
  'ProxyController',
];
