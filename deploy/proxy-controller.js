const { ethers } = require('hardhat');
const { toBytes32 } = require('../test-utils').strings;
const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, fetchIfDifferent } = deployments;
  const { deployer } = await getNamedAccounts();

  let prevAddressResolverAddress = ethers.constants.AddressZero;
  let prevProxyController;

  const { differences, address: prevProxyControllerAddress } =
    await fetchIfDifferent('ProxyController', {
      from: deployer,
      args: [prevAddressResolverAddress],
    });
  const isInitialDeployment = !prevProxyControllerAddress;

  // Set the previous proxy contract address of AddressResolver as an initial address
  // when the ProxyController is updated.
  if (differences && !isInitialDeployment) {
    prevProxyController = await ethers.getContractAt(
      'ProxyController',
      prevProxyControllerAddress,
    );
    prevAddressResolverAddress =
      await prevProxyController.getAddressResolverAddress();
  }

  const deployResult = await deploy('ProxyController', {
    from: deployer,
    args: [prevAddressResolverAddress],
  });

  await executeIfNewlyDeployment('ProxyController', deployResult, async () => {
    // Set AddressResolver as an implementation of the proxy using `setAddressResolverImpl`
    // when the ProxyController is deployed the first time.
    if (isInitialDeployment) {
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
      const addresses = await ethers
        .getContractAt('AddressResolver', prevAddressResolverAddress)
        .then((contract) => contract.getAddresses());

      const productAddresses = await prevProxyController
        .getAddress(toBytes32('ProductAddressResolver'))
        .then((address) =>
          ethers.getContractAt('ProductAddressResolver', address),
        )
        .then((contract) => contract.getProductContracts());

      // Change admin address of all proxy contracts from the old ProxyController to the new one.
      await prevProxyController
        .changeProxyAdmins(deployResult.address, [
          prevAddressResolverAddress,
          ...addresses,
          ...productAddresses,
        ])
        .then((tx) => tx.wait());
    }
  });
};

module.exports.tags = ['ProxyController'];
module.exports.dependencies = ['AddressResolver'];
