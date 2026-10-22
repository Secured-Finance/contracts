import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';
import { task } from 'hardhat/config';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  ORDER_FEE_RATE,
} from '../utils/constants';
import { toBytes32 } from '../utils/strings';

const BEACON_PROXY_SOURCE_NAME =
  'contracts/protocol/utils/UpgradeabilityBeaconProxy.sol';
const BEACON_PROXY_CONTRACT_NAME = 'UpgradeabilityBeaconProxy';
const BEACON_PROXY_FQN = `${BEACON_PROXY_SOURCE_NAME}:${BEACON_PROXY_CONTRACT_NAME}`;

const implementationContracts = {
  FutureValueVault: 'contracts/protocol/FutureValueVault.sol:FutureValueVault',
  LendingMarket: 'contracts/protocol/LendingMarket.sol:LendingMarket',
  ZCToken: 'contracts/protocol/ZCToken.sol:ZCToken',
};

interface ProxyVerificationTarget {
  address: string;
  beaconAddress: string;
  getInitializeData: () => Promise<string>;
  label: string;
}

task(
  'verify-beacon-proxies',
  'Verify current beacon proxy deployments on Etherscan',
).setAction(
  async (_, { artifacts, config, deployments, ethers, network, run }) => {
    await run('compile');

    const chainConfig = await Etherscan.getCurrentChainConfig(
      network.name,
      network.provider,
      config.etherscan.customChains,
    );
    const etherscan = Etherscan.fromChainConfig(
      config.etherscan.apiKey,
      chainConfig,
    );
    const beaconProxyArtifact = await artifacts.readArtifact(BEACON_PROXY_FQN);
    const expectedRuntimeBytecode =
      beaconProxyArtifact.deployedBytecode.toLowerCase();
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));
    const addressResolver = await proxyController.getAddressResolverAddress();
    const lendingMarketController = await proxyController
      .getAddress(toBytes32('LendingMarketController'))
      .then((address) =>
        ethers.getContractAt('LendingMarketController', address),
      );
    const currencyController = await proxyController
      .getAddress(toBytes32('CurrencyController'))
      .then((address) => ethers.getContractAt('CurrencyController', address));
    const beaconProxyController = await proxyController
      .getAddress(toBytes32('BeaconProxyController'))
      .then((address) =>
        ethers.getContractAt('BeaconProxyController', address),
      );
    const [
      futureValueVaultBeaconAddress,
      lendingMarketBeaconAddress,
      zcTokenBeaconAddress,
    ] = await Promise.all([
      beaconProxyController.getBeaconProxyAddress(
        toBytes32('FutureValueVault'),
      ),
      beaconProxyController.getBeaconProxyAddress(toBytes32('LendingMarket')),
      beaconProxyController.getBeaconProxyAddress(toBytes32('ZCToken')),
    ]);
    const currencies = await currencyController.getCurrencies();

    for (const [deploymentName, contract] of Object.entries(
      implementationContracts,
    )) {
      const implementation = await deployments.get(deploymentName);

      if (await etherscan.isVerified(implementation.address)) {
        console.log(
          `Skipping ${deploymentName} implementation at ${implementation.address}: already verified`,
        );
        continue;
      }

      await run('verify:verify', {
        address: implementation.address,
        constructorArguments: implementation.args ?? [],
        contract,
        libraries: implementation.libraries ?? {},
      });
    }

    const verifyProxy = async ({
      address,
      beaconAddress,
      getInitializeData,
      label,
    }: ProxyVerificationTarget) => {
      if (address === ethers.constants.AddressZero) {
        console.log(`Skipping ${label}: proxy is not deployed`);
        return;
      }

      // Check the explorer before comparing bytecode. An already verified
      // historical proxy can legitimately differ from the current artifact.
      if (await etherscan.isVerified(address)) {
        console.log(`Skipping ${label} at ${address}: already verified`);
        return;
      }

      const deployedRuntimeBytecode = (
        await ethers.provider.getCode(address)
      ).toLowerCase();

      if (deployedRuntimeBytecode !== expectedRuntimeBytecode) {
        console.log(
          `Skipping ${label} at ${address}: runtime bytecode does not match the current ${BEACON_PROXY_CONTRACT_NAME} artifact`,
        );
        return;
      }

      await run('verify:verify', {
        address,
        constructorArguments: [beaconAddress, await getInitializeData()],
        contract: BEACON_PROXY_FQN,
      });
    };

    for (const currency of currencies) {
      const currencyLabel = ethers.utils.parseBytes32String(currency);
      const [lendingMarketAddress, futureValueVaultAddress] = await Promise.all(
        [
          lendingMarketController.getLendingMarket(currency),
          lendingMarketController.getFutureValueVault(currency),
        ],
      );

      await verifyProxy({
        address: lendingMarketAddress,
        beaconAddress: lendingMarketBeaconAddress,
        getInitializeData: async () => {
          const lendingMarket = await ethers.getContractAt(
            'LendingMarket',
            lendingMarketAddress,
          );

          return lendingMarket.interface.encodeFunctionData('initialize', [
            addressResolver,
            currency,
            ORDER_FEE_RATE,
            CIRCUIT_BREAKER_LIMIT_RANGE,
          ]);
        },
        label: `LendingMarket(${currencyLabel})`,
      });

      await verifyProxy({
        address: futureValueVaultAddress,
        beaconAddress: futureValueVaultBeaconAddress,
        getInitializeData: async () => {
          const futureValueVault = await ethers.getContractAt(
            'FutureValueVault',
            futureValueVaultAddress,
          );

          return futureValueVault.interface.encodeFunctionData('initialize', [
            addressResolver,
          ]);
        },
        label: `FutureValueVault(${currencyLabel})`,
      });

      if (lendingMarketAddress === ethers.constants.AddressZero) {
        continue;
      }

      const maturities = await lendingMarketController.getMaturities(currency);
      const zcTokenMaturities = [ethers.constants.Zero, ...maturities];

      for (const maturity of zcTokenMaturities) {
        const zcTokenAddress = await lendingMarketController.getZCToken(
          currency,
          maturity,
        );

        await verifyProxy({
          address: zcTokenAddress,
          beaconAddress: zcTokenBeaconAddress,
          getInitializeData: async () => {
            const zcToken = await ethers.getContractAt(
              'ZCToken',
              zcTokenAddress,
            );
            const [name, symbol, decimals, asset, tokenMaturity] =
              await Promise.all([
                zcToken.name(),
                zcToken.symbol(),
                zcToken.decimals(),
                zcToken.asset(),
                zcToken.maturity(),
              ]);

            return zcToken.interface.encodeFunctionData('initialize', [
              addressResolver,
              name,
              symbol,
              decimals,
              asset,
              tokenMaturity,
            ]);
          },
          label: `ZCToken(${currencyLabel}, ${maturity.toString()})`,
        });
      }
    }
  },
);
