import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (process.env.PYTH_PRICE_FEED_ADDRESS && process.env.PYTH_PRICE_ID_FIL) {
    await deploy('PythAggregator', {
      from: deployer,
      args: [
        process.env.PYTH_PRICE_FEED_ADDRESS,
        process.env.PYTH_PRICE_ID_FIL,
        'FIL / USD',
      ],
    }).then((deployResult) => {
      return executeIfNewlyDeployment('PythAggregator', deployResult);
    });
  }

  if (process.env.GLIF_POOL_ADDRESS) {
    await deploy('GlifIFilAggregator', {
      from: deployer,
      args: [process.env.GLIF_POOL_ADDRESS],
    }).then((deployResult) => {
      return executeIfNewlyDeployment('GlifIFilAggregator', deployResult);
    });
  }
};

func.tags = ['ExternalContractsFVM'];
func.skip = async () => !process.env.PYTH_PRICE_FEED_ADDRESS;
func.runAtTheEnd = true;
export default func;
