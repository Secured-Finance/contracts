import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../test-utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy, fetchIfDifferent } = deployments;
  const { deployer } = await getNamedAccounts();

  let prevAddressResolverAddress = ethers.constants.AddressZero;
  let prevProxyController;

  const { differences, address: prevProxyControllerAddress } =
    await fetchIfDifferent('ProxyController', {
      from: deployer,
      args: [prevAddressResolverAddress],
    });

  // Set the previous proxy contract address of AddressResolver as an initial address
  // when the ProxyController is updated.
  if (differences && prevProxyControllerAddress) {
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
    if (!prevProxyControllerAddress) {
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

      // Change admin address of all proxy contracts from the old ProxyController to the new one.
      await prevProxyController
        .changeProxyAdmins(deployResult.address, [
          prevAddressResolverAddress,
          ...addresses,
        ])
        .then((tx) => tx.wait());
    }
  });
};

func.tags = ['ProxyController'];
func.dependencies = ['AddressResolver'];

export default func;
