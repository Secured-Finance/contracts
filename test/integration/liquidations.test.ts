import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { deployContracts } from '../../utils/deployment';
import { filToETHRate } from '../../utils/numbers';
import { hexETHString } from '../../utils/strings';

describe('Integration Test: Liquidations', async () => {
  let ownerSigner: SignerWithAddress;
  let aliceSigner: SignerWithAddress;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let filToETHPriceFeed: Contract;

  let lendingMarkets: Contract[] = [];
  let maturities: BigNumber[];

  before('Deploy Contracts', async () => {
    [ownerSigner, aliceSigner] = await ethers.getSigners();

    ({ tokenVault, lendingMarketController, wETHToken, filToETHPriceFeed } =
      await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, true);

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexETHString)
        .then((tx) => tx.wait());
    }

    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexETHString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexETHString);
  });

  describe('Liquidations for registered loans', async () => {
    it('Increase FIL exchange rate by 25%, check collateral coverage', async () => {
      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, '1000000000000000000', {
          value: '1000000000000000000',
        })
        .then((tx) => tx.wait());

      const bobCoverageBefore = await tokenVault.getCoverage(
        aliceSigner.address,
      );

      await lendingMarketController
        .connect(aliceSigner)
        .createOrder(
          hexETHString,
          maturities[0],
          Side.BORROW,
          '500000000000000000',
          '9990',
        )
        .then((tx) => tx.wait());

      const newPrice = filToETHRate.mul('125').div('100');
      await filToETHPriceFeed.updateAnswer(newPrice);

      const bobCoverageAfter = await tokenVault.getCoverage(
        aliceSigner.address,
      );

      expect(bobCoverageBefore.toString()).not.to.equal(
        bobCoverageAfter.toString(),
      );
    });
  });
});
