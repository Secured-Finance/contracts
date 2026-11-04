import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const waitConfirmations = getWaitConfirmations();
  const universalRouterAddress = process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS!;
  const permit2Address = process.env.UNISWAP_PERMIT2_ADDRESS!;

  const liquidator = await deployments
    .get('Liquidator')
    .then(({ address }) => ethers.getContractAt('Liquidator', address));
  const wrappedNativeToken = await liquidator.nativeToken();

  const deployResult = await deploy('UniswapUniversalRouterExecutor', {
    from: deployer,
    args: [universalRouterAddress, permit2Address, wrappedNativeToken],
    waitConfirmations,
  });
  await executeIfNewlyDeployment(
    'UniswapUniversalRouterExecutor',
    deployResult,
  );
};

func.tags = ['LiquidationSwapExecutor'];
func.dependencies = ['Liquidator'];
func.skip = async () =>
  process.env.ENABLE_AUTO_UPDATE !== 'true' ||
  !process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS ||
  !process.env.UNISWAP_PERMIT2_ADDRESS;
func.runAtTheEnd = true;
export default func;
