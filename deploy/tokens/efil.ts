import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  if (process.env.EFIL) {
    console.log(`eFIL address is ${process.env.EFIL}`);
    return;
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('EFILMock', {
    from: deployer,
    args: ['10000000000000000000000'],
  });
  await executeIfNewlyDeployment('EFILMock', deployResult);
};

func.tags = ['EFIL'];

export default func;
