import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  DeploymentStorage,
  executeIfNewlyDeployment,
} from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const orderActionLogic = await deployments.get('OrderActionLogic');
  const orderReaderLogic = await deployments.get('OrderReaderLogic');
  const orderBookLogic = await deployments.get('OrderBookLogic');

  const deployResult = await deploy('LendingMarket', {
    from: deployer,
    args: [process.env.MINIMUM_RELIABLE_AMOUNT],
    libraries: {
      OrderActionLogic: orderActionLogic.address,
      OrderReaderLogic: orderReaderLogic.address,
      OrderBookLogic: orderBookLogic.address,
    },
  });

  await executeIfNewlyDeployment('LendingMarket', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    const beaconProxyController: Contract = await proxyController
      .getAddress(toBytes32('BeaconProxyController'))
      .then((address) =>
        ethers.getContractAt('BeaconProxyController', address),
      );

    DeploymentStorage.instance.add(
      beaconProxyController.address,
      'BeaconProxyController',
      'setLendingMarketImpl',
      [deployResult.address],
    );
  });
};

func.tags = ['LendingMarkets'];
func.dependencies = ['Migration'];

export default func;
