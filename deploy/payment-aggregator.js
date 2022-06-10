module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const paymentAggregator = await deploy('PaymentAggregator', {
    from: deployer,
  });
  console.log('Deployed PaymentAggregator at ' + paymentAggregator.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setPaymentAggregatorImpl(paymentAggregator.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['PaymentAggregator'];
module.exports.dependencies = ['ProxyController'];
