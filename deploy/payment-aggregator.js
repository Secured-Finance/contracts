const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('PaymentAggregator', {
    from: deployer,
  });

  await executeIfNewlyDeployment(
    'PaymentAggregator',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      await proxyController
        .setPaymentAggregatorImpl(deployResult.address)
        .then((tx) => tx.wait());
    },
  );
};

module.exports.tags = ['PaymentAggregator'];
module.exports.dependencies = ['ProxyController'];
