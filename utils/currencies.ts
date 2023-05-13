import { BigNumber } from 'ethers';
import { hexEFIL, hexETH, hexUSDC, hexWBTC } from './strings';

export interface Currency {
  symbol: string;
  mock: string;
  key: string;
  env: string | undefined;
  haircut: number;
  orderFeeRate: number;
  autoRollFeeRate: number;
  isCollateral: boolean;
  args?: string[];
}

export interface MockPriceFeeds {
  [key: string]: {
    name: string;
    decimals: number;
    rate: BigNumber;
  }[];
}

const eFilToETHRate = BigNumber.from('3803677700000000');
const btcToETHRate = BigNumber.from('13087292239235700000');
const usdcToETHRate = BigNumber.from('670403046311442');
const wBtcToBTCRate = BigNumber.from('100100000');

const currencies: Currency[] = [
  {
    symbol: 'eFIL',
    mock: 'MockEFIL',
    key: hexEFIL,
    env: process.env.TOKEN_EFIL,
    haircut: 5000,
    orderFeeRate: 100,
    autoRollFeeRate: 250,
    isCollateral: false,
    args: ['100000000000000000000000000'], // 100,000,000 eFIL
  },
  {
    symbol: 'USDC',
    mock: 'MockUSDC',
    key: hexUSDC,
    env: process.env.TOKEN_USDC,
    haircut: 8000,
    orderFeeRate: 100,
    autoRollFeeRate: 250,
    isCollateral: true,
    args: ['100000000000000'], // 100,000,000 USDC
  },
  {
    symbol: 'WBTC',
    mock: 'MockWBTC',
    key: hexWBTC,
    env: process.env.TOKEN_WBTC,
    haircut: 8000,
    orderFeeRate: 100,
    autoRollFeeRate: 250,
    isCollateral: false,
    args: ['1000000000000'], // 10,000 BTC
  },
  {
    symbol: 'WETH',
    mock: 'MockWETH9',
    key: hexETH,
    env: process.env.TOKEN_WETH,
    haircut: 8000,
    orderFeeRate: 100,
    autoRollFeeRate: 250,
    isCollateral: true,
    args: undefined,
  },
];

const mockPriceFeeds: MockPriceFeeds = {
  [hexEFIL]: [
    {
      name: 'EFIL/ETH',
      decimals: 18,
      rate: eFilToETHRate,
    },
  ],
  [hexWBTC]: [
    {
      name: 'WBTC/BTC',
      decimals: 8,
      rate: wBtcToBTCRate,
    },
    {
      name: 'BTC/ETH',
      decimals: 8,
      rate: btcToETHRate,
    },
  ],
  [hexUSDC]: [
    {
      name: 'USDC/ETH',
      decimals: 6,
      rate: usdcToETHRate,
    },
  ],
};

const priceOracles = {
  [hexEFIL]: [process.env.EFIL_TO_ETH_RATE],
  [hexWBTC]: [process.env.WBTC_TO_BTC_RATE, process.env.BTC_TO_ETH_RATE],
  [hexUSDC]: [process.env.USDC_TO_ETH_RATE],
};

export { currencies, mockPriceFeeds, priceOracles };
