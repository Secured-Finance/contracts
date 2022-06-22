const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('AddressResolver', {
    from: deployer,
  });

  await executeIfNewlyDeployment('AddressResolver', deployResult, async () => {
    const prevProxyController = await deployments.getOrNull('ProxyController');

    // Update AddressResolver implementation address when AddressResolver is update
    // after the second deployment.
    if (prevProxyController) {
      await ethers
        .getContractAt('ProxyController', prevProxyController.address)
        .then(async (contract) =>
          contract.setAddressResolverImpl(deployResult.address),
        )
        .then((tx) => tx.wait());

      console.log(
        'Updated the proxy implementation of AddressResolver at',
        deployResult.address,
      );
    }
  });
};

module.exports.tags = ['AddressResolver'];
