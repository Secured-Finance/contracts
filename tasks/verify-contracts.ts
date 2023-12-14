import { ethers } from 'ethers';
import fs from 'fs';
import { task } from 'hardhat/config';
import {
  BASE_CURRENCY_DECIMALS,
  MINIMUM_RELIABLE_AMOUNT,
} from '../test/common/constants';

task(
  'verify-contracts',
  'Verify and register contracts on Etherscan',
).setAction(async (_, { deployments, run }) => {
  const constructorArguments = {
    CurrencyController: [BASE_CURRENCY_DECIMALS],
    LendingMarket: [MINIMUM_RELIABLE_AMOUNT],
    ProxyController: [ethers.constants.AddressZero],
  };

  const files = fs.readdirSync('contracts/protocol', { withFileTypes: true });
  const fileNames = files
    .filter((dirent) => dirent.isFile())
    .map(({ name }) => name.replace('.sol', ''));

  for (const fileName of fileNames) {
    const { address, implementation } = await deployments.get(fileName);
    await run('verify:verify', {
      address: implementation || address,
      constructorArguments: constructorArguments[fileName],
    });
  }
});
