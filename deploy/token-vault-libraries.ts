import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const waitConfirmations = parseInt(process.env.WAIT_CONFIRMATIONS || '1');

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
