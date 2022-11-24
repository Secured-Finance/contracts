import { BigNumber } from 'ethers';
import {
  btcToETHRate,
  ethToUSDRate,
  filToETHRate,
  usdcToUSDRate,
} from './numbers';
import {
  hexBTCString,
  hexETHString,
  hexFILString,
  hexUSDCString,
} from './strings';

export interface Currency {
  name: string;
  symbol: string;
  mock: string;
  key: string;
  env: string | undefined;
  haircut: number;
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
    name: 'Filecoin',
    symbol: 'eFIL',
    mock: 'MockEFIL',
    key: hexFILString,
    env: process.env.EFIL,
    haircut: 5000,
    args: ['100000000000000000000000000'], // 100,000,000 eFIL
  },
  {
    name: 'USD Coin',
    symbol: 'USDC',
    mock: 'MockUSDC',
    key: hexUSDCString,
    env: process.env.USDC,
    haircut: 8000,
    args: ['100000000000000'], // 100,000,000 USDC
  },
  {
    name: 'Bitcoin',
    symbol: 'WBTC',
    mock: 'MockWBTC',
    key: hexBTCString,
    env: process.env.WBTC,
    haircut: 8000,
    args: ['100000000000000'], // 1,000,000 BTC
  },
  {
    name: 'Ethereum',
    symbol: 'WETH',
    mock: 'MockWETH9',
    key: hexETHString,
    env: process.env.WETH,
    haircut: 8000,
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
    name: 'USDC/USD',
    key: hexUSDCString,
    decimals: 8,
    rate: usdcToUSDRate,
  },
];

export { currencies, mockRates };
