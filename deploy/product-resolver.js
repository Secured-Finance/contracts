module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');

  const productResolver = await deploy('ProductAddressResolver', {
    from: deployer,
    libraries: {
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed ProductAddressResolver at ' + productResolver.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setProductAddressResolverImpl(productResolver.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['ProductAddressResolver'];
module.exports.dependencies = [
  'Libraries',
  'Loan',
  'LendingMarketController',
  'ProxyController',
];
