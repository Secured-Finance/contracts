import { BigNumber } from 'ethers';

const toBN = (number: string) => BigNumber.from(number);

const ETH = toBN('1000000000000000000');
const filToETHRate = toBN('67175250000000000');
const ethToUSDRate = toBN('232612637168');
const btcToETHRate = toBN('23889912590000000000');
const usdcToUSDRate = toBN('100000000000');

export { toBN, ETH, filToETHRate, ethToUSDRate, btcToETHRate, usdcToUSDRate };
