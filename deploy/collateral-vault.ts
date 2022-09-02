import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../test-utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const wETHToken = await deployments.get('WETH9Mock');
  const deployResult = await deploy('CollateralVault', {
    from: deployer,
  });

  await executeIfNewlyDeployment('CollateralVault', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setCollateralVaultImpl(deployResult.address, wETHToken.address)
      .then((tx) => tx.wait());
  });
};

func.tags = ['CollateralVault'];
func.dependencies = ['ProxyController', 'WETH'];

export default func;
