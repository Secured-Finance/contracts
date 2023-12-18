import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNativeTokenAddress } from '../utils/currencies';
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

  const nativeToken = await getNativeTokenAddress(deployments);
  const deployResult = await deploy('ReserveFund', {
    from: deployer,
  });

  await executeIfNewlyDeployment('ReserveFund', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    DeploymentStorage.instance.add(
      proxyController.address,
      'ProxyController',
      'setReserveFundImpl',
      [deployResult.address, nativeToken],
    );
  });
};

func.tags = ['ReserveFund'];
func.dependencies = ['ProxyController', 'Tokens'];

export default func;
