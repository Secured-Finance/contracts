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

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  const deployResult = await deploy('LendingMarketReader', {
    from: deployer,
    args: [addressResolver.address],
  });

  await executeIfNewlyDeployment('LendingMarketReader', deployResult);
};

func.tags = ['LendingMarketReader'];
func.dependencies = ['AddressResolver', 'Migration'];

export default func;
