import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { Contract } from 'ethers';
import { DeployFunction, DeploymentsExtension } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import moment from 'moment';
import {
  currencyIterator,
  getAggregatedDecimals,
  mocks,
} from '../utils/currencies';
import { getAdjustedGenesisDate } from '../utils/dates';
import { DeploymentStorage } from '../utils/deployment';
import { getMulticallOrderBookInputs } from '../utils/markets';
import { fromBytes32, toBytes32 } from '../utils/strings';

const updateBeaconProxyContracts = async (beaconProxyController: Contract) => {
  const deployment =
    DeploymentStorage.instance.deployments[beaconProxyController.address];

  if (deployment) {
    const tx = await beaconProxyController.multicall(
      deployment.functions.map(({ name, args }) =>
        beaconProxyController.interface.encodeFunctionData(name, args),
      ),
    );

    await tx.wait();

    console.log('Updated beacon proxy contracts');
    console.table(
      deployment.functions.map(({ name, args }) => ({
        FunctionName: name,
        Args: args.join(', '),
      })),
    );
  }
};

const updateCurrencyControllerSettings = async (
  currencyController: Contract,
  ethers: HardhatEthersHelpers,
  deployments: DeploymentsExtension,
  signer: string,
) => {
  const { deploy } = deployments;

  for (const currency of currencyIterator()) {
    const currencyExists = await currencyController.currencyExists(
      currency.key,
    );
    if (currencyExists) {
      continue;
    }

    const priceFeedAddresses = currency.priceFeed.addresses.filter(Boolean);
    const mock = mocks[currency.symbol];
    let heartbeats: number[] = [];

    if (priceFeedAddresses.length === 0) {
      for (const priceFeed of mock.priceFeeds) {
        const priceFeedContract = await deploy('MockV3Aggregator', {
          from: signer,
          args: [priceFeed.decimals, currency.key, priceFeed.mockRate],
        });
        console.log(
          `Deployed MockV3Aggregator ${priceFeed.name} price feed at`,
          priceFeedContract.address,
        );

        priceFeedAddresses.push(priceFeedContract.address);
        heartbeats.push(priceFeed.heartbeat);
      }
    } else {
      heartbeats = currency.priceFeed.heartbeats;
    }

    const decimals = getAggregatedDecimals(
      ethers,
      currency.tokenAddress || (await deployments.get(mock.tokenName)).address,
      priceFeedAddresses,
    );

    await currencyController
      .addCurrency(
        currency.key,
        decimals,
        currency.haircut,
        priceFeedAddresses,
        heartbeats,
      )
      .then((tx) => tx.wait());
  }
};

const updateTokenVaultSettings = async (
  tokenVault: Contract,
  deployments: DeploymentsExtension,
) => {
  for (const currency of currencyIterator()) {
    const isRegistered = await tokenVault.isRegisteredCurrency(currency.key);
    if (isRegistered) {
      console.log(
        `Skipped registering ${currency.symbol} as supported currency`,
      );
    } else {
      const address =
        currency.tokenAddress ||
        (await deployments.get(mocks[currency.symbol].tokenName)).address;
      await tokenVault
        .registerCurrency(currency.key, address, currency.isCollateral)
        .then((tx) => tx.wait());
      console.log(`Registered ${currency.symbol} as supported currency`);
    }
  }
};

const createOrderBooks = async (
  lendingMarketController: Contract,
  ethers: HardhatEthersHelpers,
  deployments: DeploymentsExtension,
) => {
  const lendingMarketOperationLogic = await deployments
    .get('LendingMarketOperationLogic')
    .then(({ address }) =>
      ethers.getContractAt('LendingMarketOperationLogic', address),
    )
    .then((contract) => contract.attach(lendingMarketController.address));

  const genesisDate = getAdjustedGenesisDate();

  for (const currency of currencyIterator()) {
    const multicallInputs = (
      await getMulticallOrderBookInputs(
        lendingMarketController,
        currency.key,
        currency.minDebtUnitPrice,
        genesisDate,
        Number(process.env.INITIAL_MARKET_OPENING_DATE || 0),
        Number(process.env.INITIAL_MARKET_PRE_OPENING_DATE || 0),
      )
    ).map(({ callData }) => callData);

    if (multicallInputs.length > 0) {
      const receipt = await lendingMarketController
        .multicall(multicallInputs)
        .then((tx) => tx.wait());

      const lendingMarketInitializedEvent = (
        await lendingMarketOperationLogic.queryFilter(
          lendingMarketOperationLogic.filters.LendingMarketInitialized(),
          receipt.blockNumber,
        )
      ).find(({ args }) => args?.ccy === currency.key);

      console.log(
        `Deployed ${fromBytes32(currency.key)} order books at ${
          lendingMarketInitializedEvent?.args?.lendingMarket
        }`,
      );
    }

    const marketLog: Record<string, string | undefined>[] = [];
    const orderBookIds = await lendingMarketController.getOrderBookIds(
      currency.key,
    );
    const lendingMarket = await lendingMarketController
      .getLendingMarket(currency.key)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    for (let i = 0; i < orderBookIds.length; i++) {
      const { maturity, preOpeningDate, openingDate } =
        await lendingMarket.getOrderBookDetail(orderBookIds[i]);
      marketLog.push({
        OrderBookID: orderBookIds[i],
        PreOpeningDate: moment
          .unix(preOpeningDate.toString())
          .format('LLL')
          .toString(),
        OpeningDate: moment
          .unix(openingDate.toString())
          .format('LLL')
          .toString(),
        Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
      });
    }

    console.table(marketLog);
  }
};

const func: DeployFunction = async function ({
  deployments,
  ethers,
  getNamedAccounts,
}: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();

  if (process.env.ENABLE_AUTO_UPDATE !== 'true') {
    console.warn('Skipped initial settings');
    return;
  }

  // Get deployments
  const proxyController: Contract = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const beaconProxyController = await proxyController
    .getAddress(toBytes32('BeaconProxyController'))
    .then((address) => ethers.getContractAt('BeaconProxyController', address));

  const currencyController: Contract = await proxyController
    .getAddress(toBytes32('CurrencyController'))
    .then((address) => ethers.getContractAt('CurrencyController', address));

  const tokenVault: Contract = await proxyController
    .getAddress(toBytes32('TokenVault'))
    .then((address) => ethers.getContractAt('TokenVault', address));

  const lendingMarketController: Contract = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  // Set up contracts
  await updateBeaconProxyContracts(beaconProxyController);
  await updateCurrencyControllerSettings(
    currencyController,
    ethers,
    deployments,
    deployer,
  );
  await updateTokenVaultSettings(tokenVault, deployments);
  await createOrderBooks(lendingMarketController, ethers, deployments);
};

func.tags = ['InitialSettings'];
func.dependencies = ['Migration', 'Proposal'];

export default func;
