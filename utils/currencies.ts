import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { DeploymentsExtension } from 'hardhat-deploy/types';
import { toBytes32 } from './strings';

const ERC20_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        internalType: 'uint8',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

export interface Currency {
  symbol: string;
  key: string;
  tokenAddress: string | undefined;
  haircut: number;
  isCollateral: boolean;
  minDebtUnitPrice: number;
  args: string[];
  priceFeed: {
    addresses: string[];
    heartbeats: number[];
  };
  isNative: boolean;
}

export interface Mock {
  tokenName: string;
  priceFeeds: MockPriceFeed[];
}

export interface MockPriceFeed {
  name: string;
  decimals: number;
  heartbeat: number;
  mockRate?: string;
}

const INITIAL_CURRENCIES = (
  process.env.INITIAL_CURRENCIES || 'USDC,WBTC,WETH,WFIL'
).split(',');
const SYMBOLS = {
  USDC: process.env.TOKEN_SYMBOL_USDC || 'USDC',
  WBTC: process.env.TOKEN_SYMBOL_WBTC || 'WBTC',
  WETH: process.env.TOKEN_SYMBOL_WETH || 'WETH',
  WFIL: process.env.TOKEN_SYMBOL_WFIL || 'WFIL',
};
const NATIVE_TOKEN_SYMBOL = process.env.NATIVE_TOKEN_SYMBOL || 'WETH';
const NATIVE_CURRENCY_SYMBOL = process.env.NATIVE_CURRENCY_SYMBOL || 'ETH';

const currencies: Record<string, Currency> = {
  [SYMBOLS.USDC]: {
    symbol: SYMBOLS.USDC,
    key: toBytes32(SYMBOLS.USDC),
    tokenAddress: process.env.TOKEN_ADDRESS_USDC,
    haircut: 0,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: ['1000000000000000'], // 1,000,000,000 USDC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_USDC?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_USDC?.split(',').map(Number) || [],
    },
    isNative: SYMBOLS.USDC === NATIVE_TOKEN_SYMBOL,
  },
  [SYMBOLS.WBTC]: {
    symbol: SYMBOLS.WBTC,
    key: toBytes32(SYMBOLS.WBTC),
    tokenAddress: process.env.TOKEN_ADDRESS_WBTC,
    haircut: 0,
    minDebtUnitPrice: 9300,
    isCollateral: true,
    args: ['4000000000000'], // 40,000 BTC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WBTC?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WBTC?.split(',').map(Number) || [],
    },
    isNative: SYMBOLS.WBTC === NATIVE_TOKEN_SYMBOL,
  },
  [SYMBOLS.WETH]: {
    symbol: SYMBOLS.WETH,
    key: toBytes32(SYMBOLS.WETH),
    tokenAddress: process.env.TOKEN_ADDRESS_WETH,
    haircut: 0,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: ['2500000000000000000000000'], // 2,500,000 WETH
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WETH?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WETH?.split(',').map(Number) || [],
    },
    isNative: SYMBOLS.WETH === NATIVE_TOKEN_SYMBOL,
  },
  [SYMBOLS.WFIL]: {
    symbol: SYMBOLS.WFIL,
    key: toBytes32(SYMBOLS.WFIL),
    tokenAddress: process.env.TOKEN_ADDRESS_WFIL,
    haircut: 0,
    minDebtUnitPrice: 8100,
    isCollateral: false,
    args: ['250000000000000000000000000'], // 250,000,000 WFIL
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WFIL?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WFIL?.split(',').map(Number) || [],
    },
    isNative: SYMBOLS.WFIL === NATIVE_TOKEN_SYMBOL,
  },
};

const mocks: Record<string, Mock> = {
  [SYMBOLS.USDC]: {
    tokenName: 'MockUSDC',
    priceFeeds: [
      {
        name: 'USDC/USD',
        decimals: 8,
        heartbeat: 86400,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_USDC_TO_USD,
      },
    ],
  },
  [SYMBOLS.WBTC]: {
    tokenName: 'MockWBTC',
    priceFeeds: [
      {
        name: 'WBTC/BTC',
        decimals: 8,
        heartbeat: 86400,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_WBTC_TO_BTC,
      },
      {
        name: 'BTC/USD',
        decimals: 8,
        heartbeat: 3600,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_BTC_TO_USD,
      },
    ],
  },
  [SYMBOLS.WETH]: {
    tokenName: currencies[SYMBOLS.WETH].isNative ? 'MockWETH9' : 'MockWETH',
    priceFeeds: [
      {
        name: 'ETH/USD',
        decimals: 8,
        heartbeat: 3600,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_ETH_TO_USD,
      },
    ],
  },
  [SYMBOLS.WFIL]: {
    tokenName: 'MockWFIL',
    priceFeeds: [
      {
        name: 'WFIL/ETH',
        decimals: 18,
        heartbeat: 86400,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_WFIL_TO_ETH,
      },
      {
        name: 'ETH/USD',
        decimals: 8,
        heartbeat: 3600,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_ETH_TO_USD,
      },
    ],
  },
};

// Replace the native token key of a target deploying blockchain with its native token symbol
// In case of Ethereum deployment, replace the currency key(WETH) key with ETH. For other blockchains like Polygon, keep the currency key as the wrapped token symbol
// The currency key is used to express the native token symbol of a target blockchain in our protocol
const currencyIterator = (): Currency[] =>
  INITIAL_CURRENCIES.map((symbol) => {
    if (symbol === NATIVE_CURRENCY_SYMBOL) {
      symbol = NATIVE_TOKEN_SYMBOL;
    }

    const currency = currencies[symbol];

    if (!currency) {
      throw Error('Invalid currency symbol: ' + symbol);
    }

    if (currency.key === toBytes32(NATIVE_TOKEN_SYMBOL)) {
      currency.key = toBytes32(NATIVE_CURRENCY_SYMBOL);
    }

    return currency;
  });

const getAggregatedDecimals = async (
  ethers: HardhatEthersHelpers,
  tokenAddress: string,
  priceFeedAddresses: string[],
) => {
  const tokenContract = await ethers.getContractAt(ERC20_ABI, tokenAddress);
  let decimals = 0;

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

  return decimals;
};

const getNativeTokenAddress = async (deployments: DeploymentsExtension) =>
  process.env.NATIVE_TOKEN_ADDRESS ||
  process.env.TOKEN_ADDRESS_WETH ||
  (await deployments.get('MockWETH9')).address;

export {
  currencyIterator,
  getAggregatedDecimals,
  getNativeTokenAddress,
  mocks,
};
