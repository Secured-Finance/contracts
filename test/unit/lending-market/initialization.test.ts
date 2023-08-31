import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { ORDER_FEE_RATE } from '../../common/constants';

import { deployContracts } from './utils';

describe('LendingMarket - Initialization', () => {
  let lendingMarketCaller: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;

  let owner: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    [owner, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    ({ lendingMarketCaller } = await deployContracts(owner, targetCurrency));
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
    // NOTE: Need to update ethers & related modules version for checking Custom Error message of external contracts
    // using `revertedWithCustomError`.
    // Custom Error: InvalidCircuitBreakerLimitRange
    await expect(
      lendingMarketCaller.deployLendingMarket(
        ethers.utils.formatBytes32String('Test'),
        ORDER_FEE_RATE,
        10000,
      ),
    ).to.reverted;
  });
});
