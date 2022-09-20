import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

const MARGIN_CALL_THRESHOLD_RATE = 15000;
const AUTO_LIQUIDATION_THRESHOLD_RATE = 12500;
const LIQUIDATION_PRICE_RATE = 12000;
const MIN_COLLATERAL_RATE = 2500;

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const WETH = process.env.WETH || (await deployments.get('MockWETH9')).address;
  const deployResult = await deploy('TokenVault', {
    from: deployer,
  });

  await executeIfNewlyDeployment('TokenVault', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setTokenVaultImpl(
        deployResult.address,
        MARGIN_CALL_THRESHOLD_RATE,
        AUTO_LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PRICE_RATE,
        MIN_COLLATERAL_RATE,
        WETH,
      )
      .then((tx) => tx.wait());
  });
};

func.tags = ['TokenVault'];
func.dependencies = ['ProxyController', 'Tokens'];

export default func;
