import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
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
  const waitConfirmations = getWaitConfirmations();

  const proxyController: Contract = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const addressResolver: Contract = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  for (const contractName of [
    'LendingMarketReader',
    'ItayoseCallResolver',
    'OrderBookRotationResolver',
  ]) {
    await deploy(contractName, {
      from: deployer,
      args: [addressResolver.address],
      waitConfirmations,
    }).then((result) => executeIfNewlyDeployment(contractName, result));
  }
};

func.tags = ['ExternalContracts'];
func.skip = async () => process.env.ENABLE_AUTO_UPDATE !== 'true';
func.runAtTheEnd = true;
export default func;
