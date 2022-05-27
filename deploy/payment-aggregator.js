module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const addressResolver = await deployments.get('AddressResolver');

  const paymentAggregator = await deploy('PaymentAggregator', {
    from: deployer,
    args: [addressResolver.address],
  });
  console.log('Deployed PaymentAggregator at ' + paymentAggregator.address);
};

module.exports.tags = ['PaymentAggregator'];
module.exports.dependencies = ['AddressResolver'];
