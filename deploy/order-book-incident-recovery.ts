import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { getNativeTokenAddress } from '../utils/currencies';
import { getWaitConfirmations } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  if (!process.env.RECOVERY_OWNER_ADDRESS) {
    throw new Error(
      'RECOVERY_OWNER_ADDRESS must be explicitly set to the recovery Safe/multisig',
    );
  }
  if (!ethers.utils.isAddress(process.env.RECOVERY_OWNER_ADDRESS)) {
    throw new Error('RECOVERY_OWNER_ADDRESS is invalid');
  }

  const { deployer } = await getNamedAccounts();
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const [lendingMarketController, tokenVault, nativeToken] = await Promise.all([
    proxyController.getAddress(toBytes32('LendingMarketController')),
    proxyController.getAddress(toBytes32('TokenVault')),
    getNativeTokenAddress(deployments),
  ]);

  await deployments.deploy('OrderBookIncidentRecovery', {
    from: deployer,
    args: [
      lendingMarketController,
      tokenVault,
      nativeToken,
      process.env.RECOVERY_OWNER_ADDRESS,
    ],
    log: true,
    waitConfirmations: getWaitConfirmations(),
  });
};

func.tags = ['OrderBookIncidentRecovery'];
func.dependencies = ['ProxyController', 'Tokens'];
func.skip = async () => process.env.RECOVERY_ENABLED !== 'true';

export default func;
