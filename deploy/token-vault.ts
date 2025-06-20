import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../utils/constants';
import { getNativeTokenAddress } from '../utils/currencies';
import {
  DeploymentStorage,
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

  const nativeToken = await getNativeTokenAddress(deployments);
  const depositManagementLogic = await deployments.get(
    'DepositManagementLogic',
  );
  const deployResult = await deploy('TokenVault', {
    from: deployer,
    libraries: {
      DepositManagementLogic: depositManagementLogic.address,
    },
    waitConfirmations: getWaitConfirmations(),
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
        FULL_LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PROTOCOL_FEE_RATE,
        LIQUIDATOR_FEE_RATE,
        nativeToken,
      ],
    );
  });
};

func.tags = ['TokenVault'];
func.dependencies = ['ProxyController', 'Tokens', 'TokenVaultLibraries'];

export default func;
