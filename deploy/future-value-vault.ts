import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { executeIfNewlyDeployment } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('FutureValueVault', { from: deployer });

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  // Get contracts from proxyController
  const beaconProxyController = await proxyController
    .getAddress(toBytes32('BeaconProxyController'))
    .then((address) => ethers.getContractAt('BeaconProxyController', address));

  await executeIfNewlyDeployment('FutureValueVault', deployResult, async () => {
    await beaconProxyController
      .setFutureValueVaultImpl(deployResult.address)
      .then((tx) => tx.wait());
  });
};

func.tags = ['FutureValueVault'];
func.dependencies = ['BeaconProxyController', 'Migration'];

export default func;
