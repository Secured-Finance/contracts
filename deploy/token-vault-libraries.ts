import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const waitConfirmations = getWaitConfirmations();

  await deploy('DepositManagementLogic', {
    from: deployer,
    waitConfirmations,
  }).then((result) => {
    executeIfNewlyDeployment('DepositManagementLogic', result);
    return result;
  });
};

func.tags = ['TokenVaultLibraries'];

export default func;
