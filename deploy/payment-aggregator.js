module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const paymentAggregator = await deploy('PaymentAggregator', {
    from: deployer,
  });
  console.log('Deployed PaymentAggregator at ' + paymentAggregator.address);
};

module.exports.tags = ['PaymentAggregator'];
