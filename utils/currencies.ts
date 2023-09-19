import { hexETH, hexUSDC, hexWBTC, hexWFIL } from './strings';

export interface Currency {
  symbol: string;
  mock: string;
  key: string;
  env: string | undefined;
  haircut: number;
  orderFeeRate: number;
  circuitBreakerLimitRange: number;
  isCollateral: boolean;
  minDebtUnitPrice: number;
  args: string[];
  priceFeed: PriceFeed;
}

export interface PriceFeed {
  addresses: string[];
  heartbeat: number;
}

export interface MockPriceFeed {
  name: string;
  decimals: number;
  heartbeat: number;
  mockRate?: string;
}

const currencies: Currency[] = [
  {
    symbol: 'wFIL',
    mock: 'MockWFIL',
    key: hexWFIL,
    env: process.env.TOKEN_WFIL,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 500,
    minDebtUnitPrice: 8100,
    isCollateral: false,
    args: ['250000000000000000000000000'], // 250,000,000 wFIL
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WFIL?.split(',') || [],
      heartbeat: Number(process.env.PRICE_FEED_MAX_HEARTBEAT_WFIL),
    },
  },
  {
    symbol: 'USDC',
    mock: 'MockUSDC',
    key: hexUSDC,
    env: process.env.TOKEN_USDC,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 500,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: ['1000000000000000'], // 1,000,000,000 USDC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_USDC?.split(',') || [],
      heartbeat: Number(process.env.PRICE_FEED_MAX_HEARTBEAT_USDC),
    },
  },
  {
    symbol: 'WBTC',
    mock: 'MockWBTC',
    key: hexWBTC,
    env: process.env.TOKEN_WBTC,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 500,
    minDebtUnitPrice: 9300,
    isCollateral: true,
    args: ['4000000000000'], // 40,000 BTC,
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_WBTC?.split(',') || [],
      heartbeat: Number(process.env.PRICE_FEED_MAX_HEARTBEAT_WBTC),
    },
  },
  {
    symbol: 'WETH',
    mock: 'MockWETH9',
    key: hexETH,
    env: process.env.TOKEN_WETH,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 500,
    minDebtUnitPrice: 9100,
    isCollateral: true,
    args: [],
    priceFeed: {
      addresses: process.env.PRICE_FEED_ADDRESSES_ETH?.split(',') || [],
      heartbeat: Number(process.env.PRICE_FEED_MAX_HEARTBEAT_ETH),
    },
  },
];

const mockPriceFeeds: Record<string, MockPriceFeed[]> = {
  [hexWFIL]: [
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
  [hexWBTC]: [
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
  [hexUSDC]: [
    {
      name: 'USDC/USD',
      decimals: 8,
      heartbeat: 86400,
      mockRate: process.env.PRICE_FEED_MOCK_RATE_USDC_TO_USD,
    },
  ],
  [hexETH]: [
    {
      name: 'ETH/USD',
      decimals: 8,
      heartbeat: 3600,
      mockRate: process.env.PRICE_FEED_MOCK_RATE_ETH_TO_USD,
    },
  ],
};

export { currencies, mockPriceFeeds };
