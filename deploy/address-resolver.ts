import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  executeIfNewlyDeployment,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
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
      const proxyController = await ethers.getContractAt(
        'ProxyController',
        prevProxyController.address,
      );

      DeploymentStorage.instance.addDeployment(
        proxyController.address,
        'ProxyController',
        'setAddressResolverImpl',
        [deployResult.address],
      );
    }
  });
};

func.tags = ['AddressResolver'];

export default func;
