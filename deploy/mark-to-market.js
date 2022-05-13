module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const productResolver = await deployments.get('ProductAddressResolver');
  const paymentAggregator = await deployments.get('PaymentAggregator');
  const paymentAggregatorContract = await ethers.getContractAt(
    'PaymentAggregator',
    paymentAggregator.address,
  );

  const markToMarket = await deploy('MarkToMarket', {
    from: deployer,
    args: [productResolver.address],
  });
  console.log('Deployed MarkToMarket at ' + markToMarket.address);

  await (
    await paymentAggregatorContract.setMarkToMarket(markToMarket.address)
  ).wait();
};

module.exports.tags = ['MarkToMarket'];
module.exports.dependencies = ['ProductAddressResolver', 'PaymentAggregator'];
