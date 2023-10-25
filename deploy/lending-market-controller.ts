import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  executeIfNewlyDeployment,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const fundManagementLogic = await deployments.get('FundManagementLogic');
  const lendingMarketOperationLogic = await deployments.get(
    'LendingMarketOperationLogic',
  );
  const lendingMarketUserLogic = await deployments.get(
    'LendingMarketUserLogic',
  );
  const liquidationLogic = await deployments.get('LiquidationLogic');

  const deployResult = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      FundManagementLogic: fundManagementLogic.address,
      LendingMarketOperationLogic: lendingMarketOperationLogic.address,
      LendingMarketUserLogic: lendingMarketUserLogic.address,
      LiquidationLogic: liquidationLogic.address,
    },
  });

  await executeIfNewlyDeployment(
    'LendingMarketController',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      DeploymentStorage.instance.add(
        proxyController.address,
        'ProxyController',
        'setLendingMarketControllerImpl',
        [deployResult.address, process.env.MARKET_BASE_PERIOD],
      );
    },
  );
};

func.tags = ['LendingMarketController'];
func.dependencies = ['ProxyController', 'Libraries'];

export default func;
