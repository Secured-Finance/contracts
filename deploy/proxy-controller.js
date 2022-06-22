const { ethers } = require('hardhat');
const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, getOrNull } = deployments;
  const { deployer } = await getNamedAccounts();

  const prevProxyController = await getOrNull('ProxyController').then(
    (contract) =>
      contract && ethers.getContractAt('ProxyController', contract.address),
  );

  const deployResult = await deploy('ProxyController', {
    from: deployer,
    args: [prevProxyController?.address || ethers.constants.AddressZero],
  });

  await executeIfNewlyDeployment('ProxyController', deployResult, async () => {
    // Update AddressResolver implementation address at the first deployment.
    if (!prevProxyController) {
      const addressResolver = await deployments.get('AddressResolver');
      const proxyControllerContract = await ethers.getContractAt(
        'ProxyController',
        deployResult.address,
      );

      await proxyControllerContract
        .setAddressResolverImpl(addressResolver.address)
        .then((tx) => tx.wait());

      console.log(
        'Updated the proxy implementation of AddressResolver at',
        addressResolver.address,
      );
    } else {
      await prevProxyController.changeProxyAdmins(deployResult.address);
    }
  });
};

module.exports.tags = ['ProxyController'];
module.exports.dependencies = ['AddressResolver'];
