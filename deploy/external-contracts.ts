import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNativeTokenAddress } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const proxyController: Contract = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const addressResolver: Contract = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  const tokenVault: Contract = await proxyController
    .getAddress(toBytes32('TokenVault'))
    .then((address) => ethers.getContractAt('TokenVault', address));

  const lendingMarketController: Contract = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  for (const contractName of [
    'LendingMarketReader',
    'ItayoseCallResolver',
    'OrderBookRotationResolver',
  ]) {
    await deploy(contractName, {
      from: deployer,
      args: [addressResolver.address],
    }).then((result) => executeIfNewlyDeployment(contractName, result));
  }

  let uniswapRouterAddress = process.env.UNISWAP_ROUTER_ADDRESS;

  if (!uniswapRouterAddress) {
    const nativeToken = await getNativeTokenAddress(deployments);

    const deployResult = await deploy('MockUniswapRouter', {
      from: deployer,
      args: [addressResolver.address, nativeToken],
    });

    await executeIfNewlyDeployment('MockUniswapRouter', deployResult);
    uniswapRouterAddress = deployResult.address;
  }

  const nativeCurrencySymbol = toBytes32(
    process.env.NATIVE_CURRENCY_SYMBOL || 'ETH',
  );

  const deployResult = await deploy('Liquidator', {
    from: deployer,
    args: [
      nativeCurrencySymbol,
      lendingMarketController.address,
      tokenVault.address,
      uniswapRouterAddress,
    ],
  });

  executeIfNewlyDeployment('Liquidator', deployResult);
};

func.tags = ['ExternalContracts'];
func.skip = async () => process.env.ENABLE_AUTO_UPDATE !== 'true';
func.runAtTheEnd = true;
export default func;
