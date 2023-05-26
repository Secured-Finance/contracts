import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../utils/deployment';

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
  const lendingMarketConfigurationLogic = await deployments.get(
    'LendingMarketConfigurationLogic',
  );

  const deployResult = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      FundManagementLogic: fundManagementLogic.address,
      LendingMarketOperationLogic: lendingMarketOperationLogic.address,
      LendingMarketUserLogic: lendingMarketUserLogic.address,
      LendingMarketConfigurationLogic: lendingMarketConfigurationLogic.address,
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

      await proxyController
        .setLendingMarketControllerImpl(
          deployResult.address,
          process.env.MARKET_BASE_PERIOD,
          process.env.MARKET_OBSERVATION_PERIOD,
        )
        .then((tx) => tx.wait());
    },
  );
};

func.tags = ['LendingMarketController'];
func.dependencies = ['ProxyController', 'Libraries'];

export default func;
