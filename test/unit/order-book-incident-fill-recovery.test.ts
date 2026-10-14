import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexUSDC } from '../../utils/strings';

describe('OrderBookIncidentFillRecovery', () => {
  let owner: SignerWithAddress;
  let other: SignerWithAddress;
  let taker: SignerWithAddress;
  let maker: SignerWithAddress;
  let lendingMarketController: Contract;
  let tokenVault: Contract;
  let recovery: Contract;

  const maturity = 1798156800;
  const takerDeposit = 100;
  const takerFutureValue = -10;
  const makerDeposit = 200;
  const makerFutureValue = 20;
  const recoveryId = ethers.utils.id('filecoin-usdfc-incident-fill-reversal');

  const getFill = () => ({
    ccy: hexUSDC,
    maturity,
    orderId: 28,
    taker: taker.address,
    maker: maker.address,
    originalTakerSide: Side.LEND,
    amount: 1,
    amountInFV: 1,
  });

  beforeEach(async () => {
    [owner, other, taker, maker] = await ethers.getSigners();

    tokenVault = await ethers
      .getContractFactory('OrderBookIncidentFillRecoveryTokenVaultMock')
      .then((factory) => factory.deploy());
    lendingMarketController = await ethers
      .getContractFactory('OrderBookIncidentFillRecoveryControllerMock')
      .then((factory) => factory.deploy(tokenVault.address));

    await tokenVault.setDepositAmount(hexUSDC, taker.address, takerDeposit);
    await tokenVault.setDepositAmount(hexUSDC, maker.address, makerDeposit);
    await lendingMarketController.setFutureValue(
      hexUSDC,
      maturity,
      taker.address,
      takerFutureValue,
    );
    await lendingMarketController.setFutureValue(
      hexUSDC,
      maturity,
      maker.address,
      makerFutureValue,
    );

    recovery = await ethers
      .getContractFactory('OrderBookIncidentFillRecovery')
      .then((factory) =>
        factory.deploy(
          lendingMarketController.address,
          tokenVault.address,
          owner.address,
        ),
      );
  });

  it('executes the approved reversal once', async () => {
    const fill = getFill();

    await expect(
      recovery.executeIncidentOrderFillReversal(
        recoveryId,
        fill,
        takerDeposit,
        takerFutureValue,
        makerDeposit,
        makerFutureValue,
      ),
    )
      .to.emit(recovery, 'IncidentOrderFillRecoveryExecuted')
      .withArgs(recoveryId, fill.orderId, fill.ccy);

    expect(await recovery.executedRecoveries(recoveryId)).to.equal(true);
    expect(await tokenVault.paused()).to.equal(true);
    expect(await tokenVault.unpauseCount()).to.equal(1);
    expect(await tokenVault.pauseCount()).to.equal(1);
    expect(await lendingMarketController.reversalCount()).to.equal(1);
    expect(await lendingMarketController.lastOrderId()).to.equal(fill.orderId);
  });

  it('rejects duplicate execution', async () => {
    const fill = getFill();
    const args = [
      recoveryId,
      fill,
      takerDeposit,
      takerFutureValue,
      makerDeposit,
      makerFutureValue,
    ];

    await recovery.executeIncidentOrderFillReversal(...args);

    await expect(
      recovery.executeIncidentOrderFillReversal(...args),
    ).to.be.revertedWith('RecoveryAlreadyExecuted');
  });

  it('rejects execution by a non-owner', async () => {
    await expect(
      recovery
        .connect(other)
        .executeIncidentOrderFillReversal(
          recoveryId,
          getFill(),
          takerDeposit,
          takerFutureValue,
          makerDeposit,
          makerFutureValue,
        ),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('requires TokenVault to be paused', async () => {
    await tokenVault.setPaused(false);

    await expect(
      recovery.executeIncidentOrderFillReversal(
        recoveryId,
        getFill(),
        takerDeposit,
        takerFutureValue,
        makerDeposit,
        makerFutureValue,
      ),
    ).to.be.revertedWith('ProtocolNotPaused');
  });

  it('rejects an empty recovery ID', async () => {
    await expect(
      recovery.executeIncidentOrderFillReversal(
        ethers.constants.HashZero,
        getFill(),
        takerDeposit,
        takerFutureValue,
        makerDeposit,
        makerFutureValue,
      ),
    ).to.be.revertedWith('InvalidRecoveryId');
  });

  it('validates the approved Deposit and FV snapshot', async () => {
    await expect(
      recovery.executeIncidentOrderFillReversal(
        recoveryId,
        getFill(),
        takerDeposit + 1,
        takerFutureValue,
        makerDeposit,
        makerFutureValue,
      ),
    ).to.be.revertedWith('UnexpectedDeposit');

    await expect(
      recovery.executeIncidentOrderFillReversal(
        recoveryId,
        getFill(),
        takerDeposit,
        takerFutureValue,
        makerDeposit,
        makerFutureValue + 1,
      ),
    ).to.be.revertedWith('UnexpectedFutureValue');
  });

  it('rolls back the execution marker when the correction fails', async () => {
    const fill = getFill();
    await lendingMarketController.setShouldRevert(true);

    await expect(
      recovery.executeIncidentOrderFillReversal(
        recoveryId,
        fill,
        takerDeposit,
        takerFutureValue,
        makerDeposit,
        makerFutureValue,
      ),
    ).to.be.revertedWith('correction failed');

    expect(await recovery.executedRecoveries(recoveryId)).to.equal(false);
    expect(await tokenVault.paused()).to.equal(true);
    expect(await tokenVault.unpauseCount()).to.equal(0);
    expect(await lendingMarketController.reversalCount()).to.equal(0);
  });

  it('rejects invalid constructor addresses', async () => {
    const factory = await ethers.getContractFactory(
      'OrderBookIncidentFillRecovery',
    );

    await expect(
      factory.deploy(
        ethers.constants.AddressZero,
        tokenVault.address,
        owner.address,
      ),
    ).to.be.revertedWith('InvalidAddress');
  });
});
