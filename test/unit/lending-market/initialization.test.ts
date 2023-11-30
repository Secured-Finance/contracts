import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { ORDER_FEE_RATE } from '../../common/constants';

import moment from 'moment';
import { deployContracts } from './utils';

describe('LendingMarket - Initialization', () => {
  let lendingMarketCaller: Contract;
  let lendingMarket: Contract;
  let orderBookLogic: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;

  let owner: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    [owner, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    ({ lendingMarketCaller, orderBookLogic, lendingMarket } =
      await deployContracts(owner, targetCurrency));

    orderBookLogic = orderBookLogic.attach(lendingMarket.address);
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

  it('Create an order book', async () => {
    await lendingMarketCaller.deployLendingMarket(
      ethers.utils.formatBytes32String('Test'),
      ORDER_FEE_RATE,
      9999,
    );
    const { timestamp } = await ethers.provider.getBlock('latest');
    const maturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();
    const openingDate = moment(timestamp * 1000).unix();

    await expect(
      lendingMarketCaller.createOrderBook(
        targetCurrency,
        maturity,
        openingDate,
        openingDate - 604800,
      ),
    ).emit(orderBookLogic, 'OrderBookCreated');
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

  it('Fail to create an order book due to invalid caller', async () => {
    await expect(lendingMarket.createOrderBook(1, 1, 1)).revertedWith(
      'OnlyAcceptedContracts',
    );
  });
});
