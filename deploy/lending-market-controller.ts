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

  const deployResult = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      FundManagementLogic: fundManagementLogic.address,
      LendingMarketOperationLogic: lendingMarketOperationLogic.address,
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
        .setLendingMarketControllerImpl(deployResult.address)
        .then((tx) => tx.wait());
    },
  );
};

func.tags = ['LendingMarketController'];
func.dependencies = ['ProxyController', 'Libraries'];

export default func;
