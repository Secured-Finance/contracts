import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { ORDER_FEE_RATE } from '../../common/constants';
import { deployContracts } from './utils';

describe('LendingMarket - Initialization', () => {
  let lendingMarketCaller: Contract;

  let owner: SignerWithAddress;
  let signers: SignerWithAddress[];

  before(async () => {
    [owner, ...signers] = await ethers.getSigners();
    ({ lendingMarketCaller } = await deployContracts(owner));
  });

  it('Deploy Lending Market', async () => {
    await lendingMarketCaller.deployLendingMarket(
      ethers.utils.formatBytes32String('Test'),
      ORDER_FEE_RATE,
      9999,
    );

    expect(
      await lendingMarketCaller.getLendingMarket(
        ethers.utils.formatBytes32String('Test'),
      ),
    ).is.not.null;
  });

  it('Fail to deploy Lending Market with circuit breaker range more than equal to 10000', async () => {
    await expect(
      lendingMarketCaller.deployLendingMarket(
        ethers.utils.formatBytes32String('Test'),
        ORDER_FEE_RATE,
        10000,
      ),
    ).to.revertedWith('CB limit is too high');
  });
});
