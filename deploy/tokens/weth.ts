import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  if (process.env.WETH) {
    console.log(`WETH address is ${process.env.WETH}`);
    return;
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('WETH9Mock', { from: deployer });
  await executeIfNewlyDeployment('WETH9Mock', deployResult);
};

func.tags = ['WETH'];

export default func;
