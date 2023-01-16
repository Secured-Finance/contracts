import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('DepositManagementLogic', {
    from: deployer,
  }).then((result) =>
    executeIfNewlyDeployment('DepositManagementLogic', result),
  );

  await deploy('OrderBookLogic', {
    from: deployer,
  }).then((result) => executeIfNewlyDeployment('OrderBookLogic', result));

  await deploy('FundCalculationLogic', {
    from: deployer,
  }).then((result) => executeIfNewlyDeployment('FundCalculationLogic', result));
};

func.tags = ['Libraries'];

export default func;
