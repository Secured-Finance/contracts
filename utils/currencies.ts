import { BigNumber } from 'ethers';
import { hexEFIL, hexUSDC, hexWBTC, hexETH } from './strings';

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

export interface MockRate {
  [key: string]: {
    name: string;
    decimals: number;
    rate: BigNumber;
  };
}

const eFilToETHRate = BigNumber.from('3803677700000000');
const ethToUSDRate = BigNumber.from('149164000000');
const wBtcToETHRate = BigNumber.from('13087292239235700000');
const usdcToETHRate = BigNumber.from('670403046311442');

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

const mockRates: MockRate = {
  [hexEFIL]: {
    name: 'EFIL/ETH',
    decimals: 18,
    rate: eFilToETHRate,
  },
  [hexETH]: {
    name: 'ETH/USD',
    decimals: 8,
    rate: ethToUSDRate,
  },
  [hexWBTC]: {
    name: 'WBTC/ETH',
    decimals: 8,
    rate: wBtcToETHRate,
  },
  [hexUSDC]: {
    name: 'USDC/ETH',
    decimals: 6,
    rate: usdcToETHRate,
  },
};

const priceOracles = {
  [hexEFIL]: process.env.EFIL_TO_ETH_RATE,
  [hexETH]: process.env.ETH_TO_USD_RATE,
  [hexWBTC]: process.env.WBTC_TO_ETH_RATE,
  [hexUSDC]: process.env.USDC_TO_ETH_RATE,
};

export { currencies, mockRates, priceOracles };
