import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { BASE_CURRENCY_DECIMALS } from '../utils/constants';
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

  const deployResult = await deploy('CurrencyController', {
    from: deployer,
    args: [BASE_CURRENCY_DECIMALS],
    waitConfirmations: parseInt(process.env.WAIT_CONFIRMATIONS || '1'),
  });

  await executeIfNewlyDeployment(
    'CurrencyController',
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
        'setCurrencyControllerImpl',
        [deployResult.address],
      );
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController', 'Tokens'];

export default func;
