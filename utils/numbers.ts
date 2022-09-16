import { BigNumber } from 'ethers';

const toBN = (number: string) => BigNumber.from(number);

const ETH = toBN('1000000000000000000');
const filToETHRate = toBN('3803677700000000');
const ethToUSDRate = toBN('149164000000');
const btcToETHRate = toBN('13087292239235700000');
const usdcToUSDRate = toBN('100000000');

export { toBN, ETH, filToETHRate, ethToUSDRate, btcToETHRate, usdcToUSDRate };
