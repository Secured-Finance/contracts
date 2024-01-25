import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import { wFilToETHRate } from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { Signers, getPermitSignature } from '../common/signers';

describe('Integration Test: Itayose (ERC20)', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  let lendingMarketOperationLogic: Contract;

  let futureValueVault: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarket: Contract;
  let lendingMarketReader: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;

  let fundManagementLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];
  let orderBookIds: BigNumber[];

  let signers: Signers;
  let chainId: number;

  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleFILOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
  ) => {
    const amountInFIL = BigNumber.from('3000000');
    const amountInETH = amountInFIL
      .mul(wFilToETHRate)
      .div(BigNumber.from(10).pow(18));

    await wFILToken.connect(user).approve(tokenVault.address, amountInFIL);
    await tokenVault
      .connect(user)
      .deposit(hexETH, amountInETH.mul(2), { value: amountInETH.mul(2) });

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexWFIL,
        maturity,
        Side.BORROW,
        amountInFIL,
        BigNumber.from(unitPrice).add('1000'),
      );

    await lendingMarketController
      .connect(user)
      .depositAndExecuteOrder(
        hexWFIL,
        maturity,
        Side.LEND,
        amountInFIL,
        BigNumber.from(unitPrice).sub('1000'),
      );
  };

  const resetContractInstances = async () => {
    maturities = await lendingMarketController.getMaturities(hexWFIL);
    lendingMarket = await lendingMarketController
      .getLendingMarket(hexWFIL)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    orderBookIds = await lendingMarketController.getOrderBookIds(hexWFIL);

    futureValueVault = await lendingMarketController
      .getFutureValueVault(hexWFIL)
      .then((address) => ethers.getContractAt('FutureValueVault', address));
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);
    ({ chainId } = await ethers.provider.getNetwork());

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      wETHToken,
      wFILToken,
      lendingMarketOperationLogic,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, true);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate,
      );
    }

    maturities = await lendingMarketController.getMaturities(hexWFIL);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createOrderBook(
      hexWFIL,
      maturities[0],
      maturities[0].sub(604800),
    );
  });

  describe('Execute Itayose including pre-orders without prior approval', async () => {
    const orderAmountInFIL = BigNumber.from('100000000000000000');
    const orderAmountInETH = orderAmountInFIL
      .mul(wFilToETHRate)
      .div(BigNumber.from(10).pow(18));

    before(async () => {
      [alice, bob, carol, dave, ellen] = await getUsers(5);
      await resetContractInstances();
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
        value: orderAmountInETH.mul(2),
      });

      await tokenVault
        .connect(carol)
        .deposit(hexETH, orderAmountInETH.mul(10), {
          value: orderAmountInETH.mul(10),
        });

      const deadline =
        (await ethers.provider.getBlock('latest')).timestamp + 4200;

      const sig = await getPermitSignature(
        chainId,
        wFILToken,
        alice,
        tokenVault,
        orderAmountInFIL,
        deadline,
      );

      await expect(
        lendingMarketController
          .connect(alice)
          .depositWithPermitAndExecuteOrder(
            hexWFIL,
            maturities[0],
            Side.LEND,
            orderAmountInFIL,
            8000,
            deadline,
            sig.v,
            sig.r,
            sig.s,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(
            hexWFIL,
            maturities[0],
            Side.BORROW,
            orderAmountInFIL,
            0,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check future value
      const { balance: aliceFVBefore } = await futureValueVault.getBalance(
        orderBookIds[0],
        alice.address,
      );
      const { balance: bobFV } = await futureValueVault.getBalance(
        orderBookIds[0],
        bob.address,
      );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');
    });

    it('Crate pre-orders without prior approval', async () => {
      // Move to 7 days before maturity.
      await time.increaseTo(maturities[0].sub('604800').toString());

      await tokenVault.connect(ellen).deposit(hexETH, orderAmountInFIL.mul(2), {
        value: orderAmountInFIL.mul(2),
      });

      const maturity = maturities[maturities.length - 1];
      const deadline =
        (await ethers.provider.getBlock('latest')).timestamp + 4200;

      const sig = await getPermitSignature(
        chainId,
        wFILToken,
        dave,
        tokenVault,
        orderAmountInFIL,
        deadline,
      );

      await lendingMarketController
        .connect(dave)
        .depositWithPermitAndExecutePreOrder(
          hexWFIL,
          maturity,
          Side.LEND,
          orderAmountInFIL,
          7400,
          deadline,
          sig.v,
          sig.r,
          sig.s,
        );

      await lendingMarketController
        .connect(ellen)
        .executePreOrder(
          hexWFIL,
          maturity,
          Side.BORROW,
          orderAmountInFIL,
          7300,
        );
    });

    it('Execute auto-roll', async () => {
      // Auto-roll
      await createSampleFILOrders(owner, maturities[1], '8000');
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateOrderBooks(hexWFIL),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');
    });

    it('Check the expected result before Itayose execution', async () => {
      const marketInfo = await lendingMarketReader.getOrderBookDetail(
        hexWFIL,
        maturities[maturities.length - 1],
      );

      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.bestLendUnitPrice).to.equal('7300');
      expect(marketInfo.bestBorrowUnitPrice).to.equal('7400');
      expect(marketInfo.marketUnitPrice).to.equal('0');
      expect(marketInfo.blockUnitPriceHistory[0]).to.equal('0');
      expect(marketInfo.blockUnitPriceHistory[1]).to.equal('0');
      expect(marketInfo.openingUnitPrice).to.equal('7350');
    });

    it('Execute Itayose with pre-order', async () => {
      const orderBookId = orderBookIds[orderBookIds.length - 1];
      const maturity = maturities[maturities.length - 1];
      expect(await lendingMarket.isOpened(orderBookId)).to.false;

      // Itayose
      await lendingMarketController.executeItayoseCall(hexWFIL, maturity);
      const marketInfo = await lendingMarketReader.getOrderBookDetail(
        hexWFIL,
        maturity,
      );
      const { openingUnitPrice } = await lendingMarket.getItayoseLog(maturity);

      expect(await lendingMarket.isOpened(orderBookId)).to.true;
      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.bestLendUnitPrice).to.equal('10000');
      expect(marketInfo.bestBorrowUnitPrice).to.equal('0');
      expect(marketInfo.marketUnitPrice).to.equal('7350');
      expect(marketInfo.blockUnitPriceHistory[0]).to.equal('7350');
      expect(marketInfo.blockUnitPriceHistory[1]).to.equal('0');
      expect(openingUnitPrice).to.equal('7350');
      expect(marketInfo.openingUnitPrice).to.equal('7350');
    });
  });
});
