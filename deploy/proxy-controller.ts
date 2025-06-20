import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy, fetchIfDifferent } = deployments;
  const { deployer } = await getNamedAccounts();

  let addressResolverAddress = ethers.constants.AddressZero;
  let prevProxyController: Contract;

  const { differences, address: prevProxyControllerAddress } =
    await fetchIfDifferent('ProxyController', {
      from: deployer,
      args: [addressResolverAddress],
    });

  // Set the previous proxy contract address of AddressResolver as an initial address
  // when the ProxyController is updated.
  if (differences && prevProxyControllerAddress) {
    prevProxyController = await ethers.getContractAt(
      'ProxyController',
      prevProxyControllerAddress,
    );
    addressResolverAddress =
      await prevProxyController.getAddressResolverAddress();
  }

  const deployResult = await deploy('ProxyController', {
    from: deployer,
    args: [addressResolverAddress],
    waitConfirmations: getWaitConfirmations(),
  });

  await executeIfNewlyDeployment('ProxyController', deployResult, async () => {
    const proxyController = await ethers.getContractAt(
      'ProxyController',
      deployResult.address,
    );

    // Set AddressResolver as an implementation of the proxy using `setAddressResolverImpl`
    // when the ProxyController is deployed the first time.
    if (!prevProxyControllerAddress) {
      const addressResolver = await deployments.get('AddressResolver');

      await proxyController
        .setAddressResolverImpl(addressResolver.address)
        .then((tx) => tx.wait());

      console.log(
        'Updated the proxy implementation of AddressResolver at',
        addressResolver.address,
      );
    } else {
      const prevOwner = await prevProxyController.owner();
      const currentOwner = await proxyController.owner();

      if (prevOwner !== currentOwner) {
        await proxyController
          .transferOwnership(prevOwner)
          .then((tx) => tx.wait());
      }

      const addresses = await ethers
        .getContractAt('AddressResolver', addressResolverAddress)
        .then((contract) => contract.getAddresses());

      if (process.env.ENABLE_AUTO_UPDATE === 'true') {
        await prevProxyController
          .changeProxyAdmins(deployResult.address, [
            addressResolverAddress,
            ...addresses,
          ])
          .then((tx) => tx.wait());

        console.log(
          `Changed admin address of all proxy contracts to ${deployResult.address}`,
        );
      } else {
        // Change admin address of all proxy contracts from the old ProxyController to the new one.
        DeploymentStorage.instance.add(
          prevProxyController.address,
          'ProxyController',
          'changeProxyAdmins',
          [deployResult.address, [addressResolverAddress, ...addresses]],
        );
      }
    }
  });
};

func.tags = ['ProxyController'];
func.dependencies = ['AddressResolver'];

export default func;
