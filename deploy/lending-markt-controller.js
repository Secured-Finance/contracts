module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const discountFactorLibrary = await deployments.get('DiscountFactor');
  const quickSortLibrary = await deployments.get('QuickSort');
  const addressResolver = await deployments.get('AddressResolver');

  const lendingController = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      QuickSort: quickSortLibrary.address,
      DiscountFactor: discountFactorLibrary.address,
    },
    args: [addressResolver.address],
  });
  console.log(
    'Deployed LendingMarketController at ' + lendingController.address,
  );
};

module.exports.tags = ['LendingMarketController'];
module.exports.dependencies = ['AddressResolver', 'Libraries'];
