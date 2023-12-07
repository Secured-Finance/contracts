import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  executeIfNewlyDeployment,
} from '../utils/deployment';

const LIQUIDATION_THRESHOLD_RATE = 12500;
const LIQUIDATION_PROTOCOL_FEE_RATE = 200;
const LIQUIDATOR_FEE_RATE = 500;

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const nativeToken =
    process.env.NATIVE_TOKEN_ADDRESS ||
    process.env.TOKEN_WETH ||
    (await deployments.get('MockWETH9')).address;
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

    DeploymentStorage.instance.add(
      proxyController.address,
      'ProxyController',
      'setTokenVaultImpl',
      [
        deployResult.address,
        LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PROTOCOL_FEE_RATE,
        LIQUIDATOR_FEE_RATE,
        nativeToken,
      ],
    );
  });
};

func.tags = ['TokenVault'];
func.dependencies = ['ProxyController', 'Tokens', 'Libraries'];

export default func;
