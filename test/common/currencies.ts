import { BigNumber } from 'ethers';

export const wFilToETHRate = BigNumber.from('3803677700000000');
export const wBtcToBTCRate = BigNumber.from('100100000');
export const btcToUSDRate = BigNumber.from('1308729223923');
export const usdcToUSDRate = BigNumber.from('100007179');
export const ethToUSDRate = BigNumber.from('100000000000');

export const wbtcToETHRate = wBtcToBTCRate
  .mul(btcToUSDRate)
  .mul(BigNumber.from(10).pow(18))
  .div(ethToUSDRate)
  .div(BigNumber.from(10).pow(8));
export const usdcToETHRate = usdcToUSDRate
  .mul(BigNumber.from(10).pow(18))
  .div(ethToUSDRate);
export const wbtcToUSDRate = wbtcToETHRate
  .mul(ethToUSDRate)
  .div(BigNumber.from(10).pow(18));
