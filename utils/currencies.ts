import { BigNumber } from 'ethers';
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
  args: string[];
}

export interface PriceFeed {
  name: string;
  decimals: number;
  heartbeat: number;
  mockRate: BigNumber;
  address: string | undefined;
}

const wFilToETHRate = BigNumber.from('3803677700000000');
const btcToETHRate = BigNumber.from('13087292239235700000');
const usdcToETHRate = BigNumber.from('670403046311442');
const wBtcToBTCRate = BigNumber.from('100100000');

const currencies: Currency[] = [
  {
    symbol: 'wFIL',
    mock: 'MockWFIL',
    key: hexWFIL,
    env: process.env.TOKEN_WFIL,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 1000,
    isCollateral: false,
    args: ['250000000000000000000000000'], // 250,000,000 wFIL
  },
  {
    symbol: 'USDC',
    mock: 'MockUSDC',
    key: hexUSDC,
    env: process.env.TOKEN_USDC,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 1000,
    isCollateral: true,
    args: ['1000000000000000'], // 1,000,000,000 USDC
  },
  {
    symbol: 'WBTC',
    mock: 'MockWBTC',
    key: hexWBTC,
    env: process.env.TOKEN_WBTC,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 1000,
    isCollateral: true,
    args: ['4000000000000'], // 40,000 BTC
  },
  {
    symbol: 'WETH',
    mock: 'MockWETH9',
    key: hexETH,
    env: process.env.TOKEN_WETH,
    haircut: 0,
    orderFeeRate: 100,
    circuitBreakerLimitRange: 1000,
    isCollateral: true,
    args: [],
  },
];

const priceFeeds: Record<string, PriceFeed[]> = {
  [hexWFIL]: [
    {
      name: 'WFIL/ETH',
      decimals: 18,
      heartbeat: 86400,
      mockRate: wFilToETHRate,
      address: process.env.WFIL_TO_ETH_RATE,
    },
  ],
  [hexWBTC]: [
    {
      name: 'WBTC/BTC',
      decimals: 8,
      heartbeat: 86400,
      mockRate: wBtcToBTCRate,
      address: process.env.WBTC_TO_BTC_RATE,
    },
    {
      name: 'BTC/ETH',
      decimals: 18,
      heartbeat: 3600,
      mockRate: btcToETHRate,
      address: process.env.BTC_TO_ETH_RATE,
    },
  ],
  [hexUSDC]: [
    {
      name: 'USDC/ETH',
      decimals: 18,
      heartbeat: 86400,
      mockRate: usdcToETHRate,
      address: process.env.USDC_TO_ETH_RATE,
    },
  ],
};

export { currencies, priceFeeds };
