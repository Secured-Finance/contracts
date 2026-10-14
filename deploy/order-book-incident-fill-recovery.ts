import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { getWaitConfirmations } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const owner = process.env.RECOVERY_OWNER_ADDRESS ?? '';
  if (
    !ethers.utils.isAddress(owner) ||
    owner === ethers.constants.AddressZero
  ) {
    throw new Error(
      'RECOVERY_OWNER_ADDRESS must be the non-zero recovery Safe/multisig address',
    );
  }

  const { deployer } = await getNamedAccounts();
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const [lendingMarketController, tokenVault] = await Promise.all([
    proxyController.getAddress(toBytes32('LendingMarketController')),
    proxyController.getAddress(toBytes32('TokenVault')),
  ]);

  await deployments.deploy('OrderBookIncidentFillRecovery', {
    from: deployer,
    args: [lendingMarketController, tokenVault, owner],
    log: true,
    waitConfirmations: getWaitConfirmations(),
  });
};

func.tags = ['OrderBookIncidentFillRecovery'];
func.dependencies = ['ProxyController'];
func.skip = async ({ getChainId }: HardhatRuntimeEnvironment) =>
  process.env.RECOVERY_ENABLED !== 'true' || (await getChainId()) !== '314';

export default func;
