import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Liquidations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let lendingMarketControllerProxy: Contract;
  let maturities: BigNumber[];

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;
  let liquidationLogic: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: SignerWithAddress[];

  const getUsers = (count: number) => {
    const users: SignerWithAddress[] = [];

    for (let i = 0; i < count; i++) {
      const signer = signers.shift();
      if (!signer) {
        new Error('Not enough signers');
      } else {
        users.push(signer);
      }
    }
    return users;
  };

  const initialize = async (currency: string) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
    );

    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createLendingMarket(
        currency,
        genesisDate,
      );
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  before(async () => {
    [owner, ...signers] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      lendingMarketControllerProxy,
      fundManagementLogic,
      lendingMarketOperationLogic,
      liquidationLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );
    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );
    liquidationLogic = liquidationLogic.attach(
      lendingMarketControllerProxy.address,
    );

    // Set up for the mocks
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    // Set up for the mocks
    await mockTokenVault.mock.getLiquidationAmount.returns(1000, 20, 10);
    await mockTokenVault.mock.getDepositAmount.returns(100);
    await mockTokenVault.mock.transferFrom.returns(0);
    await mockTokenVault.mock['isCovered(address)'].returns(true);
    await mockTokenVault.mock.isCovered.returns(true);
    await mockReserveFund.mock.isPaused.returns(true);
    await mockCurrencyController.mock[
      'convert(bytes32,bytes32,uint256)'
    ].returns(100);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns(1);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256[])'
    ].returns([2, 3]);
    await mockCurrencyController.mock.currencyExists.returns(true);

    await initialize(targetCurrency);
  });

  describe('Liquidations', async () => {
    it("Liquidate less than 50% borrowing position in case the one position doesn't cover liquidation amount", async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          100,
        );
    });

    it('Liquidate 50% borrowing position in case the one position cover liquidation amount', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          100,
        );
    });

    it('Liquidate borrowing position using zero-coupon bonds', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      // Set up for the mocks
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([2600, 10400, 400]);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          7500,
        );
    });

    it('Liquidate insolvent user using the reserve fund', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      // Set up for the mocks
      await mockReserveFund.mock.isPaused.returns(false);
      await mockTokenVault.mock.getTotalCollateralAmount.returns(0);
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([5000, 10400, 400]);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          10000,
        );
    });

    it('Liquidate insolvent user without using the reserve fund', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      // Set up for the mocks
      await mockReserveFund.mock.isPaused.returns(false);
      await mockTokenVault.mock.getTotalCollateralAmount.returns(100);
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([2600, 10400, 400]);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          7500,
        );
    });

    it('Liquidate borrowing position after auto-roll', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      // Set up for the mocks
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([
        '26000000000000000',
        '104000000000000000',
        '4000000000000000',
      ]);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[1],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'LiquidationExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[1],
          '75000000000000000',
        );
    });

    it('Fail to liquidate a borrowing position due to no debt', async () => {
      [alice] = getUsers(1);

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('No debt in the selected maturity');
    });

    it('Fail to liquidate a borrowing position due to no liquidation amount', async () => {
      [alice, bob] = getUsers(2);

      // Set up for the mocks
      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('User has enough collateral');
    });

    it('Fail to liquidate a borrowing position due to insufficient collateral', async () => {
      [alice, bob] = getUsers(2);

      // Set up for the mocks
      await mockTokenVault.mock['isCovered(address)'].returns(false);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('Invalid liquidation');
    });
  });

  describe('Delisting', async () => {
    it('Execute repayment & redemption', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeRepayment(targetCurrency, maturities[0]),
      )
        .to.emit(fundManagementLogic, 'RepaymentExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          maturities[0],
          calculateFutureValue(orderAmount, orderRate),
        );

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeRedemption(targetCurrency, maturities[0]),
      )
        .to.emit(fundManagementLogic, 'RedemptionExecuted')
        .withArgs(bob.address, targetCurrency, maturities[0], () => true);
    });

    it('Execute repayment & redemption after auto-roll', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

      await time.increaseTo(maturities[1].toString());

      const { futureValue: aliceFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          alice.address,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeRepayment(targetCurrency, maturities[1]),
      )
        .to.emit(fundManagementLogic, 'RepaymentExecuted')
        .withArgs(alice.address, targetCurrency, maturities[1], aliceFV.abs());

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[1].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeRedemption(targetCurrency, maturities[1]),
      )
        .to.emit(fundManagementLogic, 'RedemptionExecuted')
        .withArgs(bob.address, targetCurrency, maturities[1], () => true);
    });

    it('Force repayment of overdue borrowing positions', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);
      await mockCurrencyController.mock.currencyExists.returns(false);
      await mockTokenVault.mock.calculateLiquidationFees.returns(
        '100000000',
        '50000000',
      );
      await mockCurrencyController.mock.convert.returns('100000000');

      [alice, bob] = getUsers(3);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('User has enough collateral');

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('User has enough collateral');

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeForcedRepayment(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          '125000000000000000',
        );
    });

    it('Force a insolvent user to repay', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('10000');

      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockCurrencyController.mock.currencyExists.returns(false);
      await mockTokenVault.mock.calculateLiquidationFees.returns(
        '100000000',
        '50000000',
      );
      await mockCurrencyController.mock.convert.returns('100000000');
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([
        '26000000000000000',
        '104000000000000000',
        '4000000000000000',
      ]);

      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('User has enough collateral');

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('User has enough collateral');

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeForcedRepayment(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[0],
          '75000000000000000',
        );

      const { futureValue: aliceFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      expect(aliceFV).to.be.equal('-25000000000000000');
    });

    it('Force a insolvent user to repay after auto roll', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('10000');

      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);
      await mockTokenVault.mock.transferFrom.returns(100);
      await mockTokenVault.mock.calculateLiquidationFees.returns(
        '100000000',
        '50000000',
      );
      await mockCurrencyController.mock.convert.returns('100000000');
      await mockCurrencyController.mock[
        'convert(bytes32,bytes32,uint256[])'
      ].returns([
        '26000000000000000',
        '104000000000000000',
        '4000000000000000',
      ]);

      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);
      await mockCurrencyController.mock.currencyExists.returns(false);

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[1].add(604800).toString());

      const { futureValue: aliceFVBefore } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          alice.address,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeForcedRepayment(
            targetCurrency,
            targetCurrency,
            maturities[1],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          targetCurrency,
          targetCurrency,
          maturities[1],
          '75000000000000000',
        );

      const { futureValue: aliceFVAfter } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          alice.address,
        );

      expect(aliceFVAfter).not.to.equal(0);
      expect(aliceFVAfter.sub(aliceFVBefore)).to.be.equal('75000000000000000');
    });

    it('Fail to repay due to active market', async () => {
      await expect(
        lendingMarketControllerProxy.executeRepayment(
          targetCurrency,
          maturities[0],
        ),
      ).revertedWith('Market is not matured');
    });

    it('Fail to redeem due to under repayment period', async () => {
      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.executeRedemption(
          targetCurrency,
          maturities[0],
        ),
      ).revertedWith('Not in the redemption period');
    });
  });
});
