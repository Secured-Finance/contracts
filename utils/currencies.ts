import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { hexUSDC, hexWBTC, hexWETH, hexWFIL, toBytes32 } from './strings';

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

export const ORDER_FEE_RATE = 100;
export const CIRCUIT_BREAKER_LIMIT_RANGE = 500;

const currencies: Record<string, Currency> = {
  USDC: {
    symbol: 'USDC',
    key: hexUSDC,
    tokenAddress: process.env.TOKEN_USDC,
    haircut: 0,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: ['1000000000000000'], // 1,000,000,000 USDC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_USDC?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_USDC?.split(',').map(Number) || [],
    },
  },
  WBTC: {
    symbol: 'WBTC',
    key: hexWBTC,
    tokenAddress: process.env.TOKEN_WBTC,
    haircut: 0,
    minDebtUnitPrice: 9300,
    isCollateral: true,
    args: ['4000000000000'], // 40,000 BTC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WBTC?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WBTC?.split(',').map(Number) || [],
    },
  },
  WETH: {
    symbol: 'WETH',
    key: hexWETH,
    tokenAddress: process.env.TOKEN_WETH,
    haircut: 0,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: [],
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WETH?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WETH?.split(',').map(Number) || [],
    },
  },
  wFIL: {
    symbol: 'wFIL',
    key: hexWFIL,
    tokenAddress: process.env.TOKEN_WFIL,
    haircut: 0,
    minDebtUnitPrice: 8100,
    isCollateral: false,
    args: ['250000000000000000000000000'], // 250,000,000 wFIL
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WFIL?.split(',') || [],
      heartbeats:
        process.env.PRICE_FEED_HEARTBEATS_WFIL?.split(',').map(Number) || [],
    },
  },
};

const mocks: Record<string, Mock> = {
  USDC: {
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
  WBTC: {
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
  WETH: {
    tokenName: 'MockWETH9',
    priceFeeds: [
      {
        name: 'ETH/USD',
        decimals: 8,
        heartbeat: 3600,
        mockRate: process.env.PRICE_FEED_MOCK_RATE_ETH_TO_USD,
      },
    ],
  },
  wFIL: {
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
const nativeTokenSymbol = process.env.NATIVE_TOKEN_SYMBOL || 'WETH';
const nativeCurrencySymbol = process.env.NATIVE_CURRENCY_SYMBOL || 'ETH';
const initialCurrencies = (
  process.env.INITIAL_CURRENCIES || 'USDC,WBTC,WETH,wFIL'
).split(',');

const currencyIterator = (): Currency[] =>
  initialCurrencies.map((symbol) => {
    if (symbol === toBytes32(nativeCurrencySymbol)) {
      symbol = toBytes32(nativeTokenSymbol);
    }

    const currency = currencies[symbol];

    if (!currency) {
      throw Error('Invalid currency symbol: ' + symbol);
    }

    if (currency.key === toBytes32(nativeTokenSymbol)) {
      currency.key = toBytes32(nativeCurrencySymbol);
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

export { currencyIterator, getAggregatedDecimals, mocks };
