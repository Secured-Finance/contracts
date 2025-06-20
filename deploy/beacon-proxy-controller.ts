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
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('BeaconProxyController', {
    from: deployer,
    waitConfirmations: getWaitConfirmations(),
  });

  await executeIfNewlyDeployment(
    'BeaconProxyController',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      DeploymentStorage.instance.add(
        proxyController.address,
        'ProxyController',
        'setBeaconProxyControllerImpl',
        [deployResult.address],
      );
    },
  );
};

func.tags = ['BeaconProxyController'];
func.dependencies = ['ProxyController'];

export default func;
