import fs from 'fs';
import { task } from 'hardhat/config';
import {
  BASE_CURRENCY_DECIMALS,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  MINIMUM_RELIABLE_AMOUNT,
} from '../utils/constants';
import { getNativeTokenAddress } from '../utils/currencies';

const externalContracts = [
  'ItayoseCallResolver',
  'OrderBookRotationResolver',
  'Liquidator',
  'LendingMarketReader',
];

task(
  'verify-contracts',
  'Verify and register contracts on Etherscan',
).setAction(async (_, { deployments, run, ethers, network }) => {
  const [{ address: owner }] = await ethers.getSigners();
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const addressResolver = await proxyController.getAddressResolverAddress();
  const nativeToken = await getNativeTokenAddress(deployments);

  const constructorArguments = {
    CurrencyController: [BASE_CURRENCY_DECIMALS],
    LendingMarket: [MINIMUM_RELIABLE_AMOUNT],
    ProxyController: [ethers.constants.AddressZero],
    ItayoseCallResolver: [addressResolver],
    OrderBookRotationResolver: [addressResolver],
  };

  const proxyConstructorArguments = {
    BeaconProxyController: [owner, addressResolver],
    TokenVault: [
      owner,
      addressResolver,
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      nativeToken,
    ],
    CurrencyController: [owner],
    GenesisValueVault: [addressResolver],
    LendingMarketController: [
      owner,
      addressResolver,
      process.env.MARKET_BASE_PERIOD,
    ],
    ReserveFund: [owner, addressResolver, nativeToken],
  };

  const fileNames = fs
    .readdirSync(`deployments/${network.name}`, {
      withFileTypes: true,
    })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
    .map(({ name }) => name.replace('.json', ''));

  for (const fileName of fileNames) {
    if (externalContracts.includes(fileName)) {
      continue;
    }

    const { address, implementation } = await deployments.get(fileName);
    await run('verify:verify', {
      address: implementation || address,
      constructorArguments: constructorArguments[fileName],
    });

    if (implementation) {
      const Contract = await ethers.getContractAt(fileName, address);

      await run('verify:verify', {
        address: address,
        constructorArguments: [
          implementation,
          Contract.interface.encodeFunctionData(
            'initialize',
            proxyConstructorArguments[fileName],
          ),
        ],
      });
    }
  }
});
