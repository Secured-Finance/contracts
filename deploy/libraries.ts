import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResults: Record<string, DeployResult> = {};

  for (const libName of [
    'QuickSort',
    'DepositManagementLogic',
    'LendingMarketOperationLogic',
    'OrderBookLogic',
  ]) {
    const deployResult = await deploy(libName, {
      from: deployer,
    }).then((result) => {
      executeIfNewlyDeployment(libName, result);
      return result;
    });
    deployResults[libName] = deployResult;
  }

  await deploy('FundManagementLogic', {
    from: deployer,
    libraries: {
      QuickSort: deployResults['QuickSort'].address,
    },
  }).then((result) => executeIfNewlyDeployment('FundManagementLogic', result));
};

func.tags = ['Libraries'];

export default func;
