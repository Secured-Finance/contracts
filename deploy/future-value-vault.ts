import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('FutureValueVault', {
    from: deployer,
    waitConfirmations: getWaitConfirmations(),
  });

  await executeIfNewlyDeployment('FutureValueVault', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    const beaconProxyController = await proxyController
      .getAddress(toBytes32('BeaconProxyController'))
      .then((address) =>
        ethers.getContractAt('BeaconProxyController', address),
      );

    DeploymentStorage.instance.add(
      beaconProxyController.address,
      'BeaconProxyController',
      'setFutureValueVaultImpl',
      [deployResult.address],
    );
  });
};

func.tags = ['FutureValueVault'];
func.dependencies = ['Migration'];

export default func;
