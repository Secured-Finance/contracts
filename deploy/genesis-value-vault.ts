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

  const deployResult = await deploy('GenesisValueVault', {
    from: deployer,
  });

  await executeIfNewlyDeployment(
    'GenesisValueVault',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      DeploymentStorage.instance.addDeployment(
        proxyController.address,
        'ProxyController',
        'setGenesisValueVaultImpl',
        [deployResult.address],
      );
    },
  );
};

func.tags = ['GenesisValueVault'];
func.dependencies = ['ProxyController'];

export default func;
