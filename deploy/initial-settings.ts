import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { BigNumber, Contract } from 'ethers';
import { DeployFunction, DeploymentsExtension } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import moment from 'moment';
import { currencyIterator } from '../utils/currencies';
import { getGenesisDate } from '../utils/dates';
import { DeploymentStorage } from '../utils/deployment';
import { fromBytes32, toBytes32 } from '../utils/strings';

// NOTE: Active markets are 8.
// The last market is a inactive market for Itayose.
const MARKET_COUNT = Number(process.env.TOTAL_MARKET_COUNT || 8) + 1;
const INITIAL_MARKET_COUNT = Number(
  process.env.INITIAL_MARKET_COUNT || MARKET_COUNT,
);
const OPENING_DATE_INTERVAL = Number(process.env.OPENING_DATE_INTERVAL || 0);
const DEFAULT_PRE_ORDER_PERIOD = 604800;

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
    let heartbeat = 0;
    let decimals = 0;

    if (priceFeedAddresses.length === 0) {
      for (const priceFeed of currency.mockPriceFeed) {
        const priceFeedContract = await deploy('MockV3Aggregator', {
          from: signer,
          args: [priceFeed.decimals, currency.key, priceFeed.mockRate],
        });
        console.log(
          `Deployed MockV3Aggregator ${priceFeed.name} price feed at`,
          priceFeedContract.address,
        );

        priceFeedAddresses.push(priceFeedContract.address);

        if (heartbeat < priceFeed.heartbeat) {
          heartbeat = priceFeed.heartbeat;
        }
      }
    } else {
      heartbeat = currency.priceFeed.heartbeat;
    }

    const tokenContract = await ethers.getContractAt(
      currency.mock,
      currency.env || (await deployments.get(currency.mock)).address,
    );

    for (let i = 0; i < priceFeedAddresses.length; i++) {
      if (i === 0) {
        decimals += await tokenContract.decimals();
      } else {
        const priceFeedContract = await ethers.getContractAt(
          'MockV3Aggregator',
          priceFeedAddresses[i - 1],
        );
        decimals += await priceFeedContract.decimals();
      }
    }

    await currencyController
      .addCurrency(
        currency.key,
        decimals,
        currency.haircut,
        priceFeedAddresses,
        heartbeat,
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
        currency.env || (await deployments.get(currency.mock)).address;
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

  const genesisDate =
    Number(process.env.MARKET_BASE_PERIOD) === 0
      ? Number(process.env.INITIAL_MARKET_OPENING_DATE || moment().unix())
      : getGenesisDate();

  for (const currency of currencyIterator()) {
    const isInitialized =
      await lendingMarketController.isInitializedLendingMarket(currency.key);

    if (!isInitialized) {
      await lendingMarketController
        .initializeLendingMarket(
          currency.key,
          genesisDate,
          process.env.INITIAL_COMPOUND_FACTOR,
          currency.orderFeeRate,
          currency.circuitBreakerLimitRange,
          currency.minDebtUnitPrice,
        )
        .then((tx) => tx.wait());
    }

    const lendingMarket = await lendingMarketController
      .getLendingMarket(currency.key)
      .then((address) => ethers.getContractAt('LendingMarket', address));
    const orderBookIds = await lendingMarketController.getOrderBookIds(
      currency.key,
    );

    const marketLog: Record<string, string | undefined>[] = [];

    if (orderBookIds.length > 0) {
      console.log(
        `Skipped deploying ${orderBookIds.length} ${currency.symbol} lending markets`,
      );
    }

    for (let i = 0; i < orderBookIds.length; i++) {
      const { maturity, preOpeningDate, openingDate } =
        await lendingMarket.getOrderBookDetail(orderBookIds[i]);
      marketLog.push({
        [`OrderBookID(${currency.symbol})`]: orderBookIds[i],
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

    if (orderBookIds.length < MARKET_COUNT) {
      const count = MARKET_COUNT - orderBookIds.length;
      let nearestMaturity: BigNumber = orderBookIds[0]
        ? await lendingMarket.getMaturity(orderBookIds[0])
        : undefined;

      for (let i = 0; i < count; i++) {
        const openingDateDelay =
          orderBookIds.length + i >= INITIAL_MARKET_COUNT
            ? (orderBookIds.length + i + 1 - INITIAL_MARKET_COUNT) *
              OPENING_DATE_INTERVAL
            : 0;

        const openingDate =
          i === count - 1
            ? nearestMaturity.toNumber()
            : Number(process.env.INITIAL_MARKET_OPENING_DATE || genesisDate) +
              openingDateDelay;

        const preOpeningDate =
          openingDateDelay === 0
            ? Number(
                process.env.INITIAL_MARKET_PRE_ORDER_DATE ||
                  openingDate - DEFAULT_PRE_ORDER_PERIOD,
              )
            : openingDate - DEFAULT_PRE_ORDER_PERIOD;

        const receipt = await lendingMarketController
          .createOrderBook(currency.key, openingDate, preOpeningDate)
          .then((tx) => tx.wait());

        const events = await lendingMarketOperationLogic.queryFilter(
          lendingMarketOperationLogic.filters.OrderBookCreated(),
          receipt.blockNumber,
        );

        const args = events.find(
          ({ event }) => event === 'OrderBookCreated',
        )?.args;

        const orderBookId = args?.orderBookId;
        const maturity = args?.maturity;

        if (!nearestMaturity && i === 0) {
          nearestMaturity = maturity;
        }

        marketLog.push({
          [`OrderBookID`]: orderBookId,
          PreOpeningDate: moment.unix(preOpeningDate).format('LLL').toString(),
          OpeningDate: moment
            .unix(Number(openingDate))
            .format('LLL')
            .toString(),
          Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
        });
      }
      console.log(
        `Deployed ${fromBytes32(currency.key)} Lending markets at ${
          lendingMarket.address
        }`,
      );
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
