module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const quickSortLibrary = await deployments.get('QuickSort');

  const termStructure = await deploy('TermStructure', {
    from: deployer,
    libraries: {
      QuickSort: quickSortLibrary.address,
    },
  });
  console.log('Deployed TermStructure at ' + termStructure.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController
    .setTermStructureImpl(termStructure.address)
    .then((tx) => tx.wait());
};

module.exports.tags = ['TermStructure'];
module.exports.dependencies = ['ProxyController', 'Libraries'];
