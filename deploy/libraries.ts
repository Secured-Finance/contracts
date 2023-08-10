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
    'OrderReaderLogic',
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

  deployResults['FundManagementLogic'] = await deploy('FundManagementLogic', {
    from: deployer,
    libraries: {
      QuickSort: deployResults['QuickSort'].address,
    },
  }).then((result) => {
    executeIfNewlyDeployment('FundManagementLogic', result);
    return result;
  });

  deployResults['LiquidationLogic'] = await deploy('LiquidationLogic', {
    from: deployer,
    libraries: {
      FundManagementLogic: deployResults['FundManagementLogic'].address,
    },
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
  }).then((result) =>
    executeIfNewlyDeployment('LendingMarketUserLogic', result),
  );

  await deploy('OrderActionLogic', {
    from: deployer,
    libraries: {
      OrderReaderLogic: deployResults['OrderReaderLogic'].address,
    },
  }).then((result) => executeIfNewlyDeployment('OrderActionLogic', result));
};

func.tags = ['Libraries'];

export default func;
