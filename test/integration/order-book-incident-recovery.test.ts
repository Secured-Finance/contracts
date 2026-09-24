import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers, network } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC } from '../../utils/strings';
import { deployContracts } from '../common/deployment';
import { calculateFutureValue } from '../common/orders';

// Temporarily added during incident recovery for the temporary recovery function
describe('Integration Test: Order Book Incident Recovery', () => {
  let owner: SignerWithAddress;
  let attacker: SignerWithAddress;
  let debtor: SignerWithAddress;
  let recoveryAccount: SignerWithAddress;
  let other: SignerWithAddress;
  let tokenVault: Contract;
  let genesisValueVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarket: Contract;
  let recovery: Contract;
  let usdcToken: Contract;
  let wETHToken: Contract;
  let usdcMaturity: BigNumber;
  let usdcMaturities: BigNumber[];
  let ethMaturity: BigNumber;

  const unitPrice = BigNumber.from(8000);
  const amount = BigNumber.from('1000000');
  const id = (value: string) => ethers.utils.id(value);

  before(async () => {
    [owner, attacker, debtor, recoveryAccount, other] =
      await ethers.getSigners();

    const deployed = await deployContracts();
    tokenVault = deployed.tokenVault;
    genesisValueVault = deployed.genesisValueVault;
    lendingMarketController = deployed.lendingMarketController;
    usdcToken = deployed.usdcToken;
    wETHToken = deployed.wETHToken;

    await tokenVault.updateCurrency(hexUSDC, true);
    await tokenVault.updateCurrency(hexETH, true);
    await lendingMarketController.createOrderBook(
      hexUSDC,
      deployed.genesisDate,
      deployed.genesisDate,
    );
    await lendingMarketController.createOrderBook(
      hexUSDC,
      deployed.genesisDate,
      deployed.genesisDate,
    );
    await lendingMarketController.createOrderBook(
      hexETH,
      deployed.genesisDate,
      deployed.genesisDate,
    );
    usdcMaturities = await lendingMarketController.getMaturities(hexUSDC);
    [usdcMaturity] = usdcMaturities;
    [ethMaturity] = await lendingMarketController.getMaturities(hexETH);
    lendingMarket = await lendingMarketController
      .getLendingMarket(hexUSDC)
      .then((address: string) =>
        ethers.getContractAt('LendingMarket', address),
      );

    recovery = await ethers
      .getContractFactory('OrderBookIncidentRecovery')
      .then((factory) =>
        factory.deploy(
          lendingMarketController.address,
          tokenVault.address,
          wETHToken.address,
          owner.address,
        ),
      );

    await lendingMarketController.addOperator(recovery.address);
    await tokenVault.addOperator(recovery.address);
    await lendingMarketController.pauseLendingMarket(hexUSDC);
    await lendingMarketController.pauseLendingMarket(hexETH);
    await tokenVault.pause();
  });

  it('funds and applies an ERC-20 correction while preserving pause, balance, and allowance', async () => {
    // A donated balance must not block recovery; only the before/after delta matters.
    await usdcToken.transfer(recovery.address, 1);
    const recoveryBalanceBefore = await usdcToken.balanceOf(recovery.address);
    const vaultBalanceBefore = await usdcToken.balanceOf(tokenVault.address);
    const ownerBalanceBefore = await usdcToken.balanceOf(owner.address);
    const totalDepositBefore = await tokenVault.getTotalDepositAmount(hexUSDC);
    const pendingOrderAmountBefore =
      await lendingMarketController.getPendingOrderAmount(
        hexUSDC,
        usdcMaturity,
      );
    await usdcToken.approve(recovery.address, amount);

    const correction = {
      correctionId: id('erc20-correction'),
      maturity: usdcMaturity,
      side: Side.LEND,
      amount,
      unitPrice,
    };

    await expect(
      recovery.executeCorrections(
        id('erc20-batch'),
        attacker.address,
        hexUSDC,
        amount,
        [correction],
      ),
    )
      .to.emit(recovery, 'CorrectionExecuted')
      .withArgs(
        id('erc20-batch'),
        correction.correctionId,
        attacker.address,
        hexUSDC,
        usdcMaturity,
        Side.LEND,
        amount,
        unitPrice,
      );

    const { futureValue } = await lendingMarketController.getPosition(
      hexUSDC,
      usdcMaturity,
      attacker.address,
    );
    expect(futureValue).to.equal(calculateFutureValue(amount, unitPrice));
    expect(
      await tokenVault.getDepositAmount(attacker.address, hexUSDC),
    ).to.equal(0);
    expect(await tokenVault.getTotalDepositAmount(hexUSDC)).to.equal(
      totalDepositBefore.add(amount),
    );
    expect(
      await lendingMarketController.getPendingOrderAmount(
        hexUSDC,
        usdcMaturity,
      ),
    ).to.equal(pendingOrderAmountBefore.add(amount));
    expect(await usdcToken.balanceOf(tokenVault.address)).to.equal(
      vaultBalanceBefore.add(amount),
    );
    expect(await usdcToken.balanceOf(owner.address)).to.equal(
      ownerBalanceBefore.sub(amount),
    );
    expect(await usdcToken.balanceOf(recovery.address)).to.equal(
      recoveryBalanceBefore,
    );
    expect(
      await usdcToken.allowance(recovery.address, tokenVault.address),
    ).to.equal(0);
    expect(await tokenVault.paused()).to.equal(true);
    expect(
      await recovery.executedCorrections(correction.correctionId),
    ).to.equal(true);
  });

  it('rounds correction FV consistently with the protocol calculation', async () => {
    const roundingAmount = BigNumber.from('16000000000');
    const roundingUnitPrice = BigNumber.from(9700);
    const expectedFV = calculateFutureValue(roundingAmount, roundingUnitPrice);
    expect(expectedFV).to.equal('16494845361');

    const { futureValue: futureValueBefore } =
      await lendingMarketController.getPosition(
        hexUSDC,
        usdcMaturity,
        attacker.address,
      );
    await usdcToken.approve(recovery.address, roundingAmount);
    await recovery.executeCorrections(
      id('rounding-batch'),
      attacker.address,
      hexUSDC,
      roundingAmount,
      [
        {
          correctionId: id('rounding-correction'),
          maturity: usdcMaturity,
          side: Side.LEND,
          amount: roundingAmount,
          unitPrice: roundingUnitPrice,
        },
      ],
    );

    const { futureValue: futureValueAfter } =
      await lendingMarketController.getPosition(
        hexUSDC,
        usdcMaturity,
        attacker.address,
      );
    expect(futureValueAfter.sub(futureValueBefore)).to.equal(expectedFV);
  });

  it('supports native funding without retaining native currency', async () => {
    const nativeAmount = ethers.utils.parseEther('1');
    const recoveryBalanceBefore = await ethers.provider.getBalance(
      recovery.address,
    );

    await recovery.executeCorrections(
      id('native-batch'),
      other.address,
      hexETH,
      nativeAmount,
      [
        {
          correctionId: id('native-correction'),
          maturity: ethMaturity,
          side: Side.LEND,
          amount: nativeAmount,
          unitPrice,
        },
      ],
      { value: nativeAmount },
    );

    expect(await tokenVault.getDepositAmount(other.address, hexETH)).to.equal(
      0,
    );
    expect(await ethers.provider.getBalance(recovery.address)).to.equal(
      recoveryBalanceBefore,
    );
    expect(await tokenVault.paused()).to.equal(true);
  });

  it('cancels active orders and transfers all positions and Deposit', async () => {
    const debtPV = amount.mul(10);
    const lendPV = amount.mul(2);
    const expectedDebtFV = calculateFutureValue(debtPV, unitPrice);
    const expectedLendFV = calculateFutureValue(lendPV, unitPrice);

    await tokenVault.unpause();
    await lendingMarketController.unpauseLendingMarket(hexUSDC);
    await usdcToken.transfer(debtor.address, amount);
    await usdcToken.connect(debtor).approve(tokenVault.address, amount);
    await tokenVault.connect(debtor).deposit(hexUSDC, amount);
    await lendingMarketController
      .connect(debtor)
      .executeOrder(hexUSDC, usdcMaturities[1], Side.LEND, amount, 7000);
    await lendingMarketController.pauseLendingMarket(hexUSDC);
    await tokenVault.pause();

    const orderBookId = await lendingMarketController.getOrderBookId(
      hexUSDC,
      usdcMaturities[1],
    );
    const orderActionLogicAtLendingMarket = await ethers.getContractAt(
      'OrderActionLogic',
      lendingMarket.address,
    );
    expect(
      (await lendingMarket.getLendOrderIds(orderBookId, debtor.address))
        .activeOrderIds,
    ).to.have.length(1);

    await usdcToken.approve(recovery.address, lendPV);
    await expect(
      recovery.executeCorrections(
        id('position-creation-batch'),
        debtor.address,
        hexUSDC,
        lendPV,
        [
          {
            correctionId: id('debt-creation-correction'),
            maturity: usdcMaturity,
            side: Side.BORROW,
            amount: debtPV,
            unitPrice,
          },
          {
            correctionId: id('lend-creation-correction'),
            maturity: usdcMaturities[1],
            side: Side.LEND,
            amount: lendPV,
            unitPrice,
          },
        ],
      ),
    ).to.emit(orderActionLogicAtLendingMarket, 'OrderCanceled');
    expect(
      (await lendingMarket.getLendOrderIds(orderBookId, debtor.address))
        .activeOrderIds,
    ).to.have.length(0);

    await network.provider.send('hardhat_setBalance', [
      lendingMarketController.address,
      ethers.utils.hexValue(ethers.utils.parseEther('1')),
    ]);
    await network.provider.send('hardhat_impersonateAccount', [
      lendingMarketController.address,
    ]);
    try {
      await genesisValueVault
        .connect(await ethers.getSigner(lendingMarketController.address))
        .updateGenesisValueWithFutureValue(
          hexUSDC,
          debtor.address,
          usdcMaturity,
          amount.mul(-4),
        );
    } finally {
      await network.provider.send('hardhat_stopImpersonatingAccount', [
        lendingMarketController.address,
      ]);
    }

    const futureValueVault = await lendingMarketController
      .getFutureValueVault(hexUSDC)
      .then((address: string) =>
        ethers.getContractAt('FutureValueVault', address),
      );
    const suppliesBefore = await Promise.all(
      usdcMaturities.flatMap((maturity) => [
        futureValueVault.getTotalLendingSupply(maturity),
        futureValueVault.getTotalBorrowingSupply(maturity),
      ]),
    );

    const vaultBalanceBefore = await usdcToken.balanceOf(tokenVault.address);
    const recoveryBalanceBefore = await usdcToken.balanceOf(recovery.address);
    const totalDepositBefore = await tokenVault.getTotalDepositAmount(hexUSDC);
    const debtorGenesisValueBefore = await genesisValueVault.getBalance(
      hexUSDC,
      debtor.address,
      0,
    );
    const receiverGenesisValueBefore = await genesisValueVault.getBalance(
      hexUSDC,
      recoveryAccount.address,
      0,
    );
    const totalGenesisLendingSupplyBefore =
      await genesisValueVault.getTotalLendingSupply(hexUSDC);
    const totalGenesisBorrowingSupplyBefore =
      await genesisValueVault.getTotalBorrowingSupply(hexUSDC);
    const debtorDepositBefore = await tokenVault.getDepositAmount(
      debtor.address,
      hexUSDC,
    );
    const receiverDepositBefore = await tokenVault.getDepositAmount(
      recoveryAccount.address,
      hexUSDC,
    );

    await expect(
      recovery.executeAssetTransfer(
        hexUSDC,
        debtor.address,
        recoveryAccount.address,
      ),
    )
      .to.emit(futureValueVault, 'Transfer')
      .and.to.emit(tokenVault, 'Transfer');

    const debtOrderBookId = await lendingMarketController.getOrderBookId(
      hexUSDC,
      usdcMaturity,
    );
    const [debtorDebtBalance] = await futureValueVault.getBalance(
      debtOrderBookId,
      debtor.address,
    );
    const [receiverDebtBalance] = await futureValueVault.getBalance(
      debtOrderBookId,
      recoveryAccount.address,
    );
    const [debtorLendBalance] = await futureValueVault.getBalance(
      orderBookId,
      debtor.address,
    );
    const [receiverLendBalance] = await futureValueVault.getBalance(
      orderBookId,
      recoveryAccount.address,
    );
    expect(debtorDebtBalance).to.equal(0);
    expect(debtorLendBalance).to.equal(0);
    expect(receiverDebtBalance).to.equal(expectedDebtFV.mul(-1));
    expect(receiverLendBalance).to.equal(expectedLendFV);
    expect(await tokenVault.getDepositAmount(debtor.address, hexUSDC)).to.equal(
      0,
    );
    expect(
      await tokenVault.getDepositAmount(recoveryAccount.address, hexUSDC),
    ).to.equal(receiverDepositBefore.add(debtorDepositBefore));
    expect(
      await genesisValueVault.getBalance(hexUSDC, debtor.address, 0),
    ).to.equal(0);
    expect(
      await genesisValueVault.getBalance(hexUSDC, recoveryAccount.address, 0),
    ).to.equal(receiverGenesisValueBefore.add(debtorGenesisValueBefore));
    expect(await genesisValueVault.getTotalLendingSupply(hexUSDC)).to.equal(
      totalGenesisLendingSupplyBefore,
    );
    expect(await genesisValueVault.getTotalBorrowingSupply(hexUSDC)).to.equal(
      totalGenesisBorrowingSupplyBefore,
    );
    expect(await tokenVault.getTotalDepositAmount(hexUSDC)).to.equal(
      totalDepositBefore,
    );
    const suppliesAfter = await Promise.all(
      usdcMaturities.flatMap((maturity) => [
        futureValueVault.getTotalLendingSupply(maturity),
        futureValueVault.getTotalBorrowingSupply(maturity),
      ]),
    );
    expect(suppliesAfter).to.deep.equal(suppliesBefore);
    expect(await usdcToken.balanceOf(tokenVault.address)).to.equal(
      vaultBalanceBefore,
    );
    expect(await usdcToken.balanceOf(recovery.address)).to.equal(
      recoveryBalanceBefore,
    );
    const [isEnoughCollateral] = await tokenVault.isCovered(
      recoveryAccount.address,
      ethers.constants.HashZero,
    );
    expect(isEnoughCollateral).to.equal(false);
    expect(
      (
        await lendingMarketController.getUsedMaturities(
          hexUSDC,
          recoveryAccount.address,
        )
      ).map((value: BigNumber) => value.toString()),
    ).to.include(usdcMaturity.toString());
    expect(await tokenVault.paused()).to.equal(true);

    const transferId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'address'],
        [hexUSDC, debtor.address],
      ),
    );
    expect(await recovery.executedAssetTransfers(transferId)).to.equal(true);
    await expect(
      recovery.executeAssetTransfer(
        hexUSDC,
        debtor.address,
        recoveryAccount.address,
      ),
    ).to.be.reverted;
  });

  it('rejects unauthorized, duplicate, and unpaused TokenVault execution', async () => {
    const correction = {
      correctionId: id('guard-correction'),
      maturity: usdcMaturity,
      side: Side.BORROW,
      amount,
      unitPrice,
    };

    await expect(
      lendingMarketController
        .connect(other)
        .addPendingOrderAmountForRecovery(hexUSDC, usdcMaturity, amount),
    ).to.be.reverted;
    await expect(
      lendingMarketController
        .connect(other)
        .cancelOrdersForRecovery(hexUSDC, attacker.address),
    ).to.be.reverted;
    await expect(
      lendingMarketController
        .connect(other)
        .transferAssetsForRecovery(
          hexUSDC,
          attacker.address,
          recoveryAccount.address,
        ),
    ).to.be.reverted;

    await expect(
      recovery
        .connect(other)
        .executeCorrections(
          id('unauthorized-batch'),
          other.address,
          hexUSDC,
          0,
          [correction],
        ),
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await tokenVault.unpause();
    await expect(
      recovery.executeCorrections(
        id('unpaused-batch'),
        other.address,
        hexUSDC,
        0,
        [correction],
      ),
    ).to.be.reverted;
    await tokenVault.pause();

    // The temporary cancellation path works regardless of the LendingMarket pause state.
    await lendingMarketController.unpauseLendingMarket(hexUSDC);

    await recovery.executeCorrections(
      id('guard-batch'),
      other.address,
      hexUSDC,
      0,
      [correction],
    );
    await expect(
      recovery.executeCorrections(
        id('guard-batch-2'),
        other.address,
        hexUSDC,
        0,
        [correction],
      ),
    ).to.be.reverted;
  });

  it('keeps a paused matured market unrotated and permits recovery', async () => {
    await lendingMarketController.pauseLendingMarket(hexUSDC);
    const orderBookIdsBefore = await lendingMarketController.getOrderBookIds(
      hexUSDC,
    );
    const maturitiesBefore = await lendingMarketController.getMaturities(
      hexUSDC,
    );

    await time.increaseTo(usdcMaturity.toString());
    await expect(
      lendingMarketController.rotateOrderBooks(hexUSDC),
    ).to.be.revertedWith('Pausable: paused');

    expect(
      await lendingMarketController.getOrderBookIds(hexUSDC),
    ).to.deep.equal(orderBookIdsBefore);
    expect(await lendingMarketController.getMaturities(hexUSDC)).to.deep.equal(
      maturitiesBefore,
    );
    expect(
      await genesisValueVault.isAutoRolled(hexUSDC, usdcMaturity),
    ).to.equal(false);

    const debtPV = amount.mul(3);
    await recovery.executeCorrections(
      id('post-maturity-debt-batch'),
      attacker.address,
      hexUSDC,
      0,
      [
        {
          correctionId: id('post-maturity-debt-correction'),
          maturity: usdcMaturity,
          side: Side.BORROW,
          amount: debtPV,
          unitPrice,
        },
      ],
    );

    await recovery.executeAssetTransfer(
      hexUSDC,
      attacker.address,
      recoveryAccount.address,
    );

    const futureValueVault = await lendingMarketController
      .getFutureValueVault(hexUSDC)
      .then((address: string) =>
        ethers.getContractAt('FutureValueVault', address),
      );
    const [attackerBalance] = await futureValueVault.getBalance(
      orderBookIdsBefore[0],
      attacker.address,
    );
    expect(attackerBalance).to.equal(0);
    expect(await tokenVault.paused()).to.equal(true);
  });
});
