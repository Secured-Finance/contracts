module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const quickSortLibrary = await deployments.get('QuickSort');
  const addressResolver = await deployments.get('AddressResolver');

  const termStructure = await deploy('TermStructure', {
    from: deployer,
    args: [addressResolver.address],
    libraries: {
      QuickSort: quickSortLibrary.address,
    },
  });
  console.log('Deployed TermStructure at ' + termStructure.address);
};

module.exports.tags = ['TermStructure'];
module.exports.dependencies = ['AddressResolver', 'Libraries'];
