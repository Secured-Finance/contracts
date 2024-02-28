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
  MIN_DEBT_UNIT_PRICE,
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
      MIN_DEBT_UNIT_PRICE,
    );

    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        currency,
        genesisDate,
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
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.cleanUpUsedCurrencies.returns();
    await mockTokenVault.mock.getTokenAddress.returns(
      ethers.constants.AddressZero,
    );
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
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock.isCollateral.returns(true);
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

  describe('External liquidator', async () => {
    let liquidator: Contract;

    beforeEach(async () => {
      [alice] = getUsers(1);

      await mockTokenVault.mock.getTokenAddress.returns(
        ethers.constants.AddressZero,
      );

      liquidator = await ethers
        .getContractFactory('Liquidator')
        .then((factory) =>
          factory
            .connect(owner)
            .deploy(
              targetCurrency,
              lendingMarketControllerProxy.address,
              mockTokenVault.address,
            ),
        );
    });

    it('Fail to execute liquidation call due to non-operator', async () => {
      await expect(
        liquidator
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            maturities,
            targetCurrency,
            maturities[0],
            alice.address,
            ethers.constants.AddressZero,
            10,
          ),
      ).revertedWith('CallerNotOperator');
    });

    it('Fail to execute liquidation call due to invalid maturity', async () => {
      await expect(
        liquidator.executeLiquidationCall(
          targetCurrency,
          maturities,
          targetCurrency,
          '1',
          alice.address,
          ethers.constants.AddressZero,
          10,
        ),
      ).revertedWith('InvalidMaturity');
    });

    it('Fail to execute liquidation call due to non-collateral currency selected', async () => {
      await mockCurrencyController.mock.currencyExists.returns(false);

      await expect(
        liquidator.executeLiquidationCall(
          targetCurrency,
          maturities,
          targetCurrency,
          maturities[0],
          ethers.constants.AddressZero,
          alice.address,
          10,
        ),
      ).revertedWith(`InvalidCurrency("${targetCurrency}")`);
    });

    it('Fail to execute forced repayment due to non-operator', async () => {
      await expect(
        liquidator
          .connect(alice)
          .executeForcedRepayment(
            targetCurrency,
            maturities,
            targetCurrency,
            maturities[0],
            alice.address,
            ethers.constants.AddressZero,
            10,
          ),
      ).revertedWith('CallerNotOperator');
    });

    it('Fail to execute forced repayment due to invalid maturity', async () => {
      await expect(
        liquidator.executeForcedRepayment(
          targetCurrency,
          maturities,
          targetCurrency,
          '1',
          alice.address,
          ethers.constants.AddressZero,
          10,
        ),
      ).revertedWith('InvalidMaturity');
    });

    it('Fail to execute forced repayment due to non-collateral currency selected', async () => {
      await mockCurrencyController.mock.currencyExists.returns(false);

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        liquidator.executeForcedRepayment(
          targetCurrency,
          maturities,
          targetCurrency,
          maturities[0],
          alice.address,
          ethers.constants.AddressZero,
          10,
        ),
      ).revertedWith(`InvalidCurrency("${targetCurrency}")`);
    });

    it('Fail to execute operations for collateral due to non lending market controller', async () => {
      await expect(
        liquidator
          .connect(owner)
          .executeOperationForCollateral(
            liquidator.address,
            alice.address,
            targetCurrency,
            10,
          ),
      ).revertedWith('Invalid caller');
    });

    it('Fail to execute operations for debt due to non lending market controller', async () => {
      await expect(
        liquidator
          .connect(owner)
          .executeOperationForDebt(
            liquidator.address,
            alice.address,
            targetCurrency,
            10,
            targetCurrency,
            maturities[0],
            10,
          ),
      ).revertedWith('Invalid caller');
    });
  });

  describe('Liquidations', async () => {
    it("Liquidate less than 50% borrowing position in case the one position doesn't cover liquidation amount", async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      [alice, bob, carol] = getUsers(3);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          orderRate.add(1),
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

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
      ).to.be.revertedWith(
        `NoDebt("${alice.address}", "${targetCurrency}", ${maturities[0]})`,
      );
    });

    it('Fail to liquidate a borrowing position due to no liquidation amount', async () => {
      [alice, bob] = getUsers(2);

      // Set up for the mocks
      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
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
      ).to.be.revertedWith(
        `NoLiquidationAmount("${alice.address}", "${targetCurrency}")`,
      );
    });

    it('Fail to liquidate a borrowing position due to insufficient collateral', async () => {
      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000',
          '8000',
        );

      // Set up for the mocks
      await mockTokenVault.mock.isCovered.returns(false, true);

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith('InvalidLiquidation');
    });
  });

  describe('Delisting', async () => {
    const collateralCurrency = ethers.utils.formatBytes32String('Debt');

    it('Execute repayment & redemption', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      await mockCurrencyController.mock.currencyExists.returns(false);

      [alice, bob] = getUsers(2);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await time.increaseTo(maturities[1].toString());
      await mockCurrencyController.mock.currencyExists.returns(false);

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
      await mockCurrencyController.mock.currencyExists
        .withArgs(targetCurrency)
        .returns(false);
      await mockCurrencyController.mock.currencyExists
        .withArgs(collateralCurrency)
        .returns(true);
      await mockCurrencyController.mock.currencyExists.returns(false);
      await mockTokenVault.mock.calculateLiquidationFees.returns(
        '100000000',
        '50000000',
      );
      await mockCurrencyController.mock.convert.returns('100000000');

      [alice, bob] = getUsers(3);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
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
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith(
        `NoLiquidationAmount("${alice.address}", "${collateralCurrency}")`,
      );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith(
        `NoLiquidationAmount("${alice.address}", "${collateralCurrency}")`,
      );

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeForcedRepayment(
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          collateralCurrency,
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
      await mockCurrencyController.mock.currencyExists
        .withArgs(targetCurrency)
        .returns(false);
      await mockCurrencyController.mock.currencyExists
        .withArgs(collateralCurrency)
        .returns(true);
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
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
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith(
        `NoLiquidationAmount("${alice.address}", "${collateralCurrency}")`,
      );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeLiquidationCall(
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      ).to.be.revertedWith(
        `NoLiquidationAmount("${alice.address}", "${collateralCurrency}")`,
      );

      // Move to 1 weeks after maturity.
      await time.increaseTo(maturities[0].add(604800).toString());

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .executeForcedRepayment(
            collateralCurrency,
            targetCurrency,
            maturities[0],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          collateralCurrency,
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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            orderRate,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);
      await mockCurrencyController.mock.currencyExists
        .withArgs(targetCurrency)
        .returns(false);
      await mockCurrencyController.mock.currencyExists
        .withArgs(collateralCurrency)
        .returns(true);

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
            collateralCurrency,
            targetCurrency,
            maturities[1],
            alice.address,
          ),
      )
        .to.emit(liquidationLogic, 'ForcedRepaymentExecuted')
        .withArgs(
          alice.address,
          collateralCurrency,
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
      ).revertedWith('NotRepaymentPeriod');
    });

    it('Fail to repay due to active currency', async () => {
      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.executeRepayment(
          targetCurrency,
          maturities[0],
        ),
      ).revertedWith('NotRepaymentPeriod');
    });

    it('Fail to redeem due to active market', async () => {
      await expect(
        lendingMarketControllerProxy.executeRedemption(
          targetCurrency,
          maturities[0],
        ),
      ).revertedWith('NotRedemptionPeriod');
    });

    it('Fail to redeem due to under repayment period', async () => {
      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.executeRedemption(
          targetCurrency,
          maturities[0],
        ),
      ).revertedWith('NotRedemptionPeriod');
    });

    it('Fail to repay due to invalid maturity', async () => {
      await expect(
        lendingMarketControllerProxy.executeRepayment(targetCurrency, '1'),
      ).to.be.revertedWith('InvalidMaturity');
    });

    it('Fail to redeem due to invalid maturity', async () => {
      await expect(
        lendingMarketControllerProxy.executeRedemption(targetCurrency, '1'),
      ).to.be.revertedWith('InvalidMaturity');
    });
  });
});
