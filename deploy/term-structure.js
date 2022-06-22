const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const quickSortLibrary = await deployments.get('QuickSort');

  const deployResult = await deploy('TermStructure', {
    from: deployer,
    libraries: {
      QuickSort: quickSortLibrary.address,
    },
  });

  await executeIfNewlyDeployment('TermStructure', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setTermStructureImpl(deployResult.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['TermStructure'];
module.exports.dependencies = ['ProxyController', 'Libraries'];
