import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../../utils/constants';
import { deployContracts } from './utils';

describe('LendingMarket - Operations', () => {
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

  it('Pause and unpause the lending market', async () => {
    await lendingMarketCaller.pause(targetCurrency);
    expect(await lendingMarket.paused()).to.be.true;

    await expect(
      lendingMarketCaller.cancelOrder(
        targetCurrency,
        1,
        ethers.constants.AddressZero,
        1,
      ),
    ).to.be.revertedWith('Pausable: paused');

    await expect(
      lendingMarketCaller.executeOrder(targetCurrency, 1, Side.LEND, 1, 1),
    ).to.be.revertedWith('Pausable: paused');

    await expect(
      lendingMarketCaller.executePreOrder(targetCurrency, 1, Side.LEND, 1, 1),
    ).to.be.revertedWith('Pausable: paused');

    await expect(
      lendingMarketCaller.unwindPosition(targetCurrency, 1, Side.LEND, 1),
    ).to.be.revertedWith('Pausable: paused');

    await expect(
      lendingMarketCaller.executeItayoseCall(targetCurrency, 1),
    ).to.be.revertedWith('Pausable: paused');

    await lendingMarketCaller.unpause(targetCurrency);
    expect(await lendingMarket.paused()).to.be.false;
  });

  it('Fail to update the order fee rate due to invalid caller', async () => {
    await expect(lendingMarket.updateOrderFeeRate(1)).revertedWith(
      'OnlyAcceptedContracts',
    );
  });

  it('Fail to update the circuit breaker limit range due to invalid caller', async () => {
    await expect(lendingMarket.updateCircuitBreakerLimitRange(1)).revertedWith(
      'OnlyAcceptedContracts',
    );
  });
});
