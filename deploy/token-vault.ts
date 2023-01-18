import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const LIQUIDATION_THRESHOLD_RATE = 12500;

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const WETH =
    process.env.TOKEN_WETH || (await deployments.get('MockWETH9')).address;
  const depositManagementLogic = await deployments.get(
    'DepositManagementLogic',
  );
  const deployResult = await deploy('TokenVault', {
    from: deployer,
    libraries: {
      DepositManagementLogic: depositManagementLogic.address,
    },
  });

  await executeIfNewlyDeployment('TokenVault', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setTokenVaultImpl(
        deployResult.address,
        LIQUIDATION_THRESHOLD_RATE,
        process.env.UNISWAP_SWAP_ROUTER_CONTRACT,
        WETH,
      )
      .then((tx) => tx.wait());
  });
};

func.tags = ['TokenVault'];
func.dependencies = ['ProxyController', 'Tokens', 'Libraries'];

export default func;
