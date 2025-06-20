import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
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

  const deployResults: Record<string, DeployResult> = {};
  const waitConfirmations = getWaitConfirmations();

  for (const libName of ['QuickSort', 'LendingMarketOperationLogic']) {
    const deployResult = await deploy(libName, {
      from: deployer,
      waitConfirmations,
    }).then((result) => {
      executeIfNewlyDeployment(libName, result);
      return result;
    });
    deployResults[libName] = deployResult;
  }

  deployResults['FundManagementLogic'] = await deploy('FundManagementLogic', {
    from: deployer,
    libraries: {
      QuickSort: deployResults['QuickSort'].address,
    },
    waitConfirmations,
  }).then((result) => {
    executeIfNewlyDeployment('FundManagementLogic', result);
    return result;
  });

  deployResults['LiquidationLogic'] = await deploy('LiquidationLogic', {
    from: deployer,
    libraries: {
      FundManagementLogic: deployResults['FundManagementLogic'].address,
    },
    waitConfirmations,
  }).then((result) => {
    executeIfNewlyDeployment('LiquidationLogic', result);
    return result;
  });

  await deploy('LendingMarketUserLogic', {
    from: deployer,
    libraries: {
      FundManagementLogic: deployResults['FundManagementLogic'].address,
      LendingMarketOperationLogic:
        deployResults['LendingMarketOperationLogic'].address,
    },
    waitConfirmations,
  }).then((result) =>
    executeIfNewlyDeployment('LendingMarketUserLogic', result),
  );
};

func.tags = ['LendingMarketControllerLibraries'];

export default func;
