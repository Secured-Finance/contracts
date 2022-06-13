module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const discountFactorLibrary = await deployments.get('DiscountFactor');
  const quickSortLibrary = await deployments.get('QuickSort');

  const lendingController = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      QuickSort: quickSortLibrary.address,
      DiscountFactor: discountFactorLibrary.address,
    },
  });
  console.log(
    'Deployed LendingMarketController at ' + lendingController.address,
  );

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setLendingMarketControllerImpl(lendingController.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['LendingMarketController'];
module.exports.dependencies = ['ProxyController', 'Libraries'];
