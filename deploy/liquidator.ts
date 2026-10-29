import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const assertExistingConfiguration = async (
  liquidator: Contract,
  nativeToken: string,
  lendingMarketController: string,
  tokenVault: string,
) => {
  const [
    currentNativeToken,
    currentLendingMarketController,
    currentTokenVault,
  ] = await Promise.all([
    liquidator.nativeToken(),
    liquidator.lendingMarketController(),
    liquidator.tokenVault(),
  ]);

  const expectedAddresses: Record<string, string> = {
    nativeToken,
    lendingMarketController,
    tokenVault,
  };
  const currentAddresses: Record<string, string> = {
    nativeToken: currentNativeToken,
    lendingMarketController: currentLendingMarketController,
    tokenVault: currentTokenVault,
  };

  for (const key of Object.keys(expectedAddresses)) {
    if (
      expectedAddresses[key].toLowerCase() !==
      currentAddresses[key].toLowerCase()
    ) {
      throw new Error(
        `Liquidator ${key} mismatch: expected ${expectedAddresses[key]}, current ${currentAddresses[key]}`,
      );
    }
  }
};

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

  const tokenVault: Contract = await proxyController
    .getAddress(toBytes32('TokenVault'))
    .then((address) => ethers.getContractAt('TokenVault', address));

  const lendingMarketController: Contract = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  const nativeCurrencySymbol = toBytes32(
    process.env.NATIVE_CURRENCY_SYMBOL || 'ETH',
  );
  const nativeToken = await tokenVault.getTokenAddress(nativeCurrencySymbol);
  const currentLiquidator = await deployments.getOrNull('Liquidator');

  if (currentLiquidator) {
    if (!currentLiquidator.implementation) {
      throw new Error(
        `Liquidator at ${currentLiquidator.address} is not a proxy deployment; migrate it explicitly instead of replacing it`,
      );
    }

    await assertExistingConfiguration(
      await ethers.getContractAt('Liquidator', currentLiquidator.address),
      nativeToken,
      lendingMarketController.address,
      tokenVault.address,
    );
  }

  const deployResult = await deploy('Liquidator', {
    from: deployer,
    proxy: {
      owner: deployer,
      execute: {
        init: {
          methodName: 'initialize',
          args: [],
        },
      },
      proxyContract: 'OpenZeppelinTransparentProxy',
    },
    args: [
      nativeCurrencySymbol,
      lendingMarketController.address,
      tokenVault.address,
    ],
    waitConfirmations,
  });

  await executeIfNewlyDeployment('Liquidator', deployResult);
};

func.tags = ['Liquidator'];
func.skip = async () => process.env.ENABLE_AUTO_UPDATE !== 'true';
func.runAtTheEnd = true;
export default func;
