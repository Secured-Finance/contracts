import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import { MockContract } from 'ethereum-waffle';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Side } from '../utils/constants';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  HAIRCUT,
  INITIAL_COMPOUND_FACTOR,
  MIN_DEBT_UNIT_PRICE,
} from '../test/common/constants';
import { deployContracts } from '../test/unit/lending-market-controller/utils';

describe('USDFC MAR2027 recovery', () => {
  const targetCurrency = ethers.utils.formatBytes32String('USDFC');
  const maturities = [BigNumber.from(1806019200), BigNumber.from(1798156800)];
  let owner: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    carol: SignerWithAddress,
    dave: SignerWithAddress;
  let lendingMarketControllerProxy: Contract;
  let mockTokenVault: MockContract, mockReserveFund: MockContract;
  let snapshot: string;

  before(async () => {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();
    const deployed = await deployContracts(owner);
    ({ lendingMarketControllerProxy, mockTokenVault, mockReserveFund } =
      deployed);
    const { mockCurrencyController, mockERC20 } = deployed;
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(HAIRCUT);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns(10);
    await mockTokenVault.mock.calculateCoverage.returns(1000, false);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256,bool)'
    ].returns(0);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock.canDepositCurrency.returns(true);
    await mockTokenVault.mock['isCollateral(bytes32[])'].returns([true]);
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockTokenVault.mock.getLiquidationThresholdRate.returns(12500);
    await mockERC20.mock.decimals.returns(18);
    const genesisDate = Date.parse('2026-09-25T00:00:00Z') / 1000;
    await lendingMarketControllerProxy.initializeLendingMarket(
      targetCurrency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      0,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      MIN_DEBT_UNIT_PRICE,
    );
    for (let i = 0; i < 2; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        targetCurrency,
        genesisDate,
        genesisDate,
      );
    }
    expect(
      await lendingMarketControllerProxy.isValidMaturity(
        targetCurrency,
        maturities[0],
      ),
    ).to.equal(true);
    snapshot = await ethers.provider.send('evm_snapshot', []);
  });

  after(async () => {
    if (snapshot) await ethers.provider.send('evm_revert', [snapshot]);
  });
  describe('Operator ZC recovery', () => {
    const value = BigNumber.from('100000000000000000');
    let token: Contract;
    let vault: Contract;
    let amount: BigNumber;
    let bookId: number;

    beforeEach(async () => {
      await ethers.provider.send('evm_revert', [snapshot]);
      snapshot = await ethers.provider.send('evm_snapshot', []);
      await lendingMarketControllerProxy.updateOrderFeeRate(targetCurrency, 0);
      await mockTokenVault.mock.getCollateralDetail.returns(0, 0, 0);
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '9500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');
      await lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');
      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );
      amount = (
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        )
      ).futureValue;
      token = await ethers.getContractAt(
        'ZCToken',
        await lendingMarketControllerProxy.getZCToken(
          targetCurrency,
          maturities[0],
        ),
      );
      vault = await ethers.getContractAt(
        'FutureValueVault',
        await lendingMarketControllerProxy.getFutureValueVault(targetCurrency),
      );
      bookId = await lendingMarketControllerProxy.getOrderBookId(
        targetCurrency,
        maturities[0],
      );
    });

    const withdraw = (quantity = amount, recipient = carol.address) =>
      lendingMarketControllerProxy.forceWithdrawZCToken(
        targetCurrency,
        maturities[0],
        alice.address,
        recipient,
        quantity,
      );
    const deposit = (quantity = amount, recipient = bob.address) =>
      lendingMarketControllerProxy.forceDepositZCToken(
        targetCurrency,
        maturities[0],
        carol.address,
        recipient,
        quantity,
      );

    it('recovers exact FV despite collateral limits while paused, and atomically splits it between debt and reserve', async () => {
      const unrelatedBefore = await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturities[0],
        dave.address,
      );
      const lendingSupply = await vault.getTotalLendingSupply(maturities[0]);
      const borrowingSupply = await vault.getTotalBorrowingSupply(
        maturities[0],
      );
      await mockTokenVault.mock.getCollateralDetail.returns(0, 1, 0);
      expect(
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.equal(0);
      await lendingMarketControllerProxy.pauseLendingMarket(targetCurrency);
      await expect(withdraw())
        .to.emit(lendingMarketControllerProxy, 'ZCTokenForceWithdrawn')
        .withArgs(
          owner.address,
          targetCurrency,
          maturities[0],
          alice.address,
          carol.address,
          amount,
        );
      expect(await token.balanceOf(carol.address)).to.equal(amount);
      expect(await vault.getTotalLockedBalance(bookId)).to.equal(amount);
      const debt = (
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          bob.address,
        )
      ).futureValue.mul(-1);
      const encode = (to: string, quantity: BigNumber) =>
        lendingMarketControllerProxy.interface.encodeFunctionData(
          'forceDepositZCToken',
          [targetCurrency, maturities[0], carol.address, to, quantity],
        );
      await expect(
        lendingMarketControllerProxy.multicall([
          encode(bob.address, debt),
          encode(mockReserveFund.address, amount.sub(debt)),
        ]),
      )
        .to.emit(lendingMarketControllerProxy, 'ZCTokenForceDeposited')
        .withArgs(
          owner.address,
          targetCurrency,
          maturities[0],
          carol.address,
          mockReserveFund.address,
          amount.sub(debt),
        );
      expect(
        (
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            bob.address,
          )
        ).futureValue,
      ).to.equal(0);
      expect(
        (
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            mockReserveFund.address,
          )
        ).futureValue,
      ).to.equal(amount.sub(debt));
      expect(
        await lendingMarketControllerProxy.getUsedCurrencies(
          mockReserveFund.address,
        ),
      ).to.include(targetCurrency);
      expect(await token.totalSupply()).to.equal(0);
      expect(await vault.getTotalLockedBalance(bookId)).to.equal(0);
      expect(await vault.getTotalLendingSupply(maturities[0])).to.equal(
        lendingSupply,
      );
      expect(await vault.getTotalBorrowingSupply(maturities[0])).to.equal(
        borrowingSupply,
      );
      expect(
        (
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            dave.address,
          )
        ).futureValue,
      ).to.equal(unrelatedBefore.futureValue);
    });

    it('rolls back the entire batch if the second deposit exceeds the balance', async () => {
      await withdraw();
      const before = (
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          bob.address,
        )
      ).futureValue;
      const encode = (quantity: BigNumber) =>
        lendingMarketControllerProxy.interface.encodeFunctionData(
          'forceDepositZCToken',
          [targetCurrency, maturities[0], carol.address, bob.address, quantity],
        );
      await expect(
        lendingMarketControllerProxy.multicall([
          encode(amount.div(2)),
          encode(amount),
        ]),
      ).to.be.revertedWith('ERC20: burn amount exceeds balance');
      expect(await token.balanceOf(carol.address)).to.equal(amount);
      expect(
        (
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            bob.address,
          )
        ).futureValue,
      ).to.equal(before);
      expect(await vault.getTotalLockedBalance(bookId)).to.equal(amount);
    });

    it('requires Operator role, honors grants and revocations, including multicall', async () => {
      const args = [
        targetCurrency,
        maturities[0],
        alice.address,
        carol.address,
        amount,
      ];
      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .forceWithdrawZCToken(...args),
      ).to.be.revertedWith('CallerNotOperator');
      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .forceDepositZCToken(...args),
      ).to.be.revertedWith('CallerNotOperator');
      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .multicall([
            lendingMarketControllerProxy.interface.encodeFunctionData(
              'forceWithdrawZCToken',
              args,
            ),
          ]),
      ).to.be.revertedWith('CallerNotOperator');
      await lendingMarketControllerProxy.addOperator(carol.address);
      await lendingMarketControllerProxy
        .connect(carol)
        .forceWithdrawZCToken(...args);
      await lendingMarketControllerProxy.removeOperator(carol.address);
      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .forceDepositZCToken(
            targetCurrency,
            maturities[0],
            carol.address,
            alice.address,
            amount,
          ),
      ).to.be.revertedWith('CallerNotOperator');
    });

    it('rejects zero amounts, invalid addresses and maturities, and unavailable balances', async () => {
      await expect(withdraw(BigNumber.from(0))).to.be.revertedWith(
        'AmountIsZero',
      );
      await expect(deposit(BigNumber.from(0))).to.be.revertedWith(
        'AmountIsZero',
      );
      await expect(
        withdraw(amount, ethers.constants.AddressZero),
      ).to.be.revertedWith('InvalidZCRecoveryAddress');
      await expect(
        deposit(amount, ethers.constants.AddressZero),
      ).to.be.revertedWith('InvalidZCRecoveryAddress');
      await expect(withdraw(amount.add(1))).to.be.revertedWith(
        'InsufficientBalance',
      );
      await withdraw();
      await expect(deposit(amount.add(1))).to.be.revertedWith(
        'ERC20: burn amount exceeds balance',
      );
      expect(await token.balanceOf(carol.address)).to.equal(amount);
    });

    it('rejects other currencies, other maturities and perpetual ZC on both entry points', async () => {
      for (const [ccy, maturity] of [
        [ethers.utils.formatBytes32String('USDC'), maturities[0]],
        [targetCurrency, maturities[1]],
        [targetCurrency, 0],
      ]) {
        for (const method of ['forceWithdrawZCToken', 'forceDepositZCToken']) {
          await expect(
            lendingMarketControllerProxy[method](
              ccy,
              maturity,
              alice.address,
              carol.address,
              1,
            ),
          ).to.be.revertedWith('InvalidRecoveryTarget');
        }
      }
    });

    it('recovers ZC that was deposited normally into an internal FV position', async () => {
      await withdraw();
      await lendingMarketControllerProxy
        .connect(carol)
        .depositZCToken(targetCurrency, maturities[0], amount);
      expect(await token.balanceOf(carol.address)).to.equal(0);
      await lendingMarketControllerProxy.forceWithdrawZCToken(
        targetCurrency,
        maturities[0],
        carol.address,
        alice.address,
        amount,
      );
      expect(
        (
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            carol.address,
          )
        ).futureValue,
      ).to.equal(0);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });
  });
});
