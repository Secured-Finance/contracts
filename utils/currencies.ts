import { BigNumber } from 'ethers';
import {
  btcToETHRate,
  ethToUSDRate,
  filToETHRate,
  usdcToETHRate,
} from './numbers';
import {
  hexBTCString,
  hexETHString,
  hexFILString,
  hexUSDCString,
} from './strings';

export interface Currency {
  symbol: string;
  mock: string;
  key: string;
  env: string | undefined;
  haircut: number;
  isCollateral: boolean;
  args?: string[];
}

export interface MockRate {
  name: string;
  key: string;
  decimals: number;
  rate: BigNumber;
}

const currencies: Currency[] = [
  {
    symbol: 'eFIL',
    mock: 'MockEFIL',
    key: hexFILString,
    env: process.env.EFIL,
    haircut: 5000,
    isCollateral: false,
    args: ['100000000000000000000000000'], // 100,000,000 eFIL
  },
  {
    symbol: 'USDC',
    mock: 'MockUSDC',
    key: hexUSDCString,
    env: process.env.USDC,
    haircut: 8000,
    isCollateral: true,
    args: ['100000000000000'], // 100,000,000 USDC
  },
  {
    symbol: 'WBTC',
    mock: 'MockWBTC',
    key: hexBTCString,
    env: process.env.WBTC,
    haircut: 8000,
    isCollateral: false,
    args: ['100000000000000'], // 1,000,000 BTC
  },
  {
    symbol: 'WETH',
    mock: 'MockWETH9',
    key: hexETHString,
    env: process.env.WETH,
    haircut: 8000,
    isCollateral: true,
    args: undefined,
  },
];

const mockRates: MockRate[] = [
  {
    name: 'FIL/ETH',
    key: hexFILString,
    decimals: 18,
    rate: filToETHRate,
  },
  {
    name: 'ETH/USD',
    key: hexETHString,
    decimals: 8,
    rate: ethToUSDRate,
  },
  {
    name: 'BTC/ETH',
    key: hexBTCString,
    decimals: 18,
    rate: btcToETHRate,
  },
  {
    name: 'USDC/ETH',
    key: hexUSDCString,
    decimals: 8,
    rate: usdcToETHRate,
  },
];

export { currencies, mockRates };
