import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';

describe('Integration Test: Order griefing mitigation', () => {
  let owner: SignerWithAddress;
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let settlementCaller: SignerWithAddress;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarket: Contract;
  let lendingMarketReader: Contract;
  let lendingMarketOperationLogic: Contract;

  before(async () => {
    [owner, borrower, lender, settlementCaller] = await ethers.getSigners();
    ({
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      lendingMarketOperationLogic,
    } = await deployContracts());

    await tokenVault.updateCurrency(hexETH, true);
  });

  it('Keeps funds and getters consistent while Itayose is settled across transactions', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = timestamp + 7200;
    const orderAmount = BigNumber.from('100000000000000000');

    await lendingMarketController.createOrderBook(
      hexETH,
      openingDate,
      openingDate - 604800,
    );
    const [maturity] = await lendingMarketController.getMaturities(hexETH);
    const [orderBookId] = await lendingMarketController.getOrderBookIds(hexETH);
    lendingMarket = await lendingMarketController
      .getLendingMarket(hexETH)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    const range = await lendingMarketController.getOrderUnitPriceRange(
      hexETH,
      maturity,
    );
    expect(range.isMinDebtUnitPriceReference).to.equal(true);

    await tokenVault.connect(borrower).deposit(hexETH, orderAmount.mul(2), {
      value: orderAmount.mul(2),
    });
    await tokenVault.connect(lender).deposit(hexETH, orderAmount.mul(2), {
      value: orderAmount.mul(2),
    });
    await lendingMarketController
      .connect(borrower)
      .executePreOrder(
        hexETH,
        maturity,
        Side.BORROW,
        orderAmount,
        range.referenceUnitPrice,
      );
    await lendingMarketController
      .connect(lender)
      .executePreOrder(
        hexETH,
        maturity,
        Side.LEND,
        orderAmount,
        range.referenceUnitPrice,
      );

    await time.increaseTo(openingDate);

    const initializeTx = await lendingMarketController
      .connect(borrower)
      .executeItayoseStep(hexETH, maturity);
    await expect(initializeTx)
      .to.emit(lendingMarketOperationLogic, 'ItayoseProcessInitialized')
      .withArgs(
        hexETH,
        maturity,
        range.referenceUnitPrice,
        range.referenceUnitPrice,
        range.referenceUnitPrice,
        orderAmount,
      );

    const detail = await lendingMarketReader.getOrderBookDetail(
      hexETH,
      maturity,
    );
    expect(detail.openingUnitPrice).to.equal(range.referenceUnitPrice);
    expect(detail.isReady).to.equal(false);
    expect(await lendingMarket.isOpened(orderBookId)).to.equal(false);

    const estimationBeforeSettlement = await lendingMarket.getItayoseEstimation(
      orderBookId,
    );

    const borrowSettlementTx = await lendingMarketController
      .connect(settlementCaller)
      .executeItayoseStep(hexETH, maturity);
    await expect(borrowSettlementTx)
      .to.emit(lendingMarketOperationLogic, 'ItayoseSettlementProgress')
      .withArgs(hexETH, maturity, Side.BORROW, orderAmount, orderAmount, 0);

    const borrowerPositionBeforeCleanup =
      await lendingMarketController.getPosition(
        hexETH,
        maturity,
        borrower.address,
      );
    const lenderPositionBeforeSettlement =
      await lendingMarketController.getPosition(
        hexETH,
        maturity,
        lender.address,
      );
    expect(borrowerPositionBeforeCleanup.presentValue).to.be.lt(0);
    expect(borrowerPositionBeforeCleanup.futureValue).to.be.lt(0);
    expect(lenderPositionBeforeSettlement.presentValue).to.equal(0);
    expect(lenderPositionBeforeSettlement.futureValue).to.equal(0);

    await lendingMarketController
      .connect(borrower)
      .cleanUpFunds(hexETH, borrower.address);
    const borrowerPositionAfterCleanup =
      await lendingMarketController.getPosition(
        hexETH,
        maturity,
        borrower.address,
      );
    expect(borrowerPositionAfterCleanup.presentValue).to.equal(
      borrowerPositionBeforeCleanup.presentValue,
    );
    expect(borrowerPositionAfterCleanup.futureValue).to.equal(
      borrowerPositionBeforeCleanup.futureValue,
    );

    await lendingMarketController
      .connect(owner)
      .executeItayoseStep(hexETH, maturity);
    const finalizable = await lendingMarketController.getItayoseProcessStatus(
      hexETH,
      maturity,
    );
    expect(finalizable.isFinalizable).to.equal(true);
    expect(finalizable.isReady).to.equal(false);

    const lenderPositionBeforeFinalize =
      await lendingMarketController.getPosition(
        hexETH,
        maturity,
        lender.address,
      );
    expect(lenderPositionBeforeFinalize.presentValue).to.be.gt(0);
    expect(lenderPositionBeforeFinalize.futureValue).to.be.gt(0);
    expect(
      await lendingMarketController.getPendingOrderAmount(hexETH, maturity),
    ).to.equal(orderAmount);

    const estimationAfterSettlement = await lendingMarket.getItayoseEstimation(
      orderBookId,
    );
    expect(estimationAfterSettlement.openingUnitPrice).to.equal(
      estimationBeforeSettlement.openingUnitPrice,
    );
    expect(estimationAfterSettlement.lastLendUnitPrice).to.equal(
      estimationBeforeSettlement.lastLendUnitPrice,
    );
    expect(estimationAfterSettlement.lastBorrowUnitPrice).to.equal(
      estimationBeforeSettlement.lastBorrowUnitPrice,
    );
    expect(estimationAfterSettlement.totalOffsetAmount).to.equal(
      estimationBeforeSettlement.totalOffsetAmount,
    );

    const finalizeTx = await lendingMarketController
      .connect(settlementCaller)
      .executeItayoseStep(hexETH, maturity);
    await expect(finalizeTx).to.emit(
      lendingMarketOperationLogic,
      'ItayoseProcessFinalized',
    );
    await expect(finalizeTx).to.emit(lendingMarket, 'ItayoseExecuted');

    const finalized = await lendingMarketController.getItayoseProcessStatus(
      hexETH,
      maturity,
    );
    expect(finalized.isInProgress).to.equal(false);
    expect(finalized.isReady).to.equal(true);
    expect(await lendingMarket.isOpened(orderBookId)).to.equal(true);

    const finalizedDetail = await lendingMarketReader.getOrderBookDetail(
      hexETH,
      maturity,
    );
    expect(finalizedDetail.openingUnitPrice).to.equal(range.referenceUnitPrice);
    expect(finalizedDetail.isReady).to.equal(true);

    const lenderPositionAfterFinalize =
      await lendingMarketController.getPosition(
        hexETH,
        maturity,
        lender.address,
      );
    expect(lenderPositionAfterFinalize.presentValue).to.equal(
      lenderPositionBeforeFinalize.presentValue,
    );
    expect(lenderPositionAfterFinalize.futureValue).to.equal(
      lenderPositionBeforeFinalize.futureValue,
    );
  });
});
