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
  const waitConfirmations = parseInt(process.env.WAIT_CONFIRMATIONS || '1');

  for (const libName of ['OrderReaderLogic', 'OrderBookLogic']) {
    const deployResult = await deploy(libName, {
      from: deployer,
      waitConfirmations,
    }).then((result) => {
      executeIfNewlyDeployment(libName, result);
      return result;
    });
    deployResults[libName] = deployResult;
  }

  await deploy('OrderActionLogic', {
    from: deployer,
    libraries: {
      OrderReaderLogic: deployResults['OrderReaderLogic'].address,
    },
    waitConfirmations,
  }).then((result) => executeIfNewlyDeployment('OrderActionLogic', result));
};

func.tags = ['LendingMarketLibraries'];

export default func;
