import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { NATIVE_CURRENCY_SYMBOL } from '../utils/currencies';
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
  const [lendingMarketController, tokenVaultAddress] = await Promise.all([
    proxyController.getAddress(toBytes32('LendingMarketController')),
    proxyController.getAddress(toBytes32('TokenVault')),
  ]);

  // Derive nativeToken from TokenVault to ensure consistency across chains
  const tokenVault = await ethers.getContractAt(
    'ITokenVault',
    tokenVaultAddress,
  );
  const nativeToken = await tokenVault.getTokenAddress(
    toBytes32(NATIVE_CURRENCY_SYMBOL),
  );

  await deployments.deploy('OrderBookIncidentRecovery', {
    from: deployer,
    args: [
      lendingMarketController,
      tokenVaultAddress,
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
