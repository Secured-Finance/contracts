import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_THRESHOLD_RATE,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { calculateFutureValue, calculateOrderFee } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Calculations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let lendingMarketControllerProxy: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    await initialize(targetCurrency);
  });

  before(async () => {
    [owner, alice, bob, ...signers] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      fundManagementLogic,
      lendingMarketOperationLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );
    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.isCovered.returns(true);
    await mockTokenVault.mock['isCollateral(bytes32[])'].returns([true]);
    await mockTokenVault.mock.calculateCoverage.returns('1000', false);
  });

  const initialize = async (currency: string) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
    );
    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(currency, genesisDate);
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  describe('Total Funds Calculations', async () => {
    const updateReturnValuesOfConvertToBaseCurrencyMock = async (inputs?: {
      workingLendOrdersAmount?: string | number | BigNumber;
      claimableAmount?: string | number | BigNumber;
      collateralAmount?: string | number | BigNumber;
      lentAmount?: string | number | BigNumber;
      workingBorrowOrdersAmount?: string | number | BigNumber;
      debtAmount?: string | number | BigNumber;
      borrowedAmount?: string | number | BigNumber;
    }) => {
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256[])'
      ].returns([
        inputs?.workingLendOrdersAmount ?? 0,
        inputs?.claimableAmount ?? 0,
        inputs?.collateralAmount ?? 0,
        inputs?.lentAmount ?? 0,
        inputs?.workingBorrowOrdersAmount ?? 0,
        inputs?.debtAmount ?? 0,
        inputs?.borrowedAmount ?? 0,
      ]);
    };

    it('Calculate total funds without positions', async () => {
      await updateReturnValuesOfConvertToBaseCurrencyMock({
        workingLendOrdersAmount: '1000000000',
        claimableAmount: '2000000000',
        collateralAmount: '3000000000',
        lentAmount: '4000000000',
        workingBorrowOrdersAmount: '5000000000',
        debtAmount: '6000000000',
        borrowedAmount: '7000000000',
      });

      const totalFunds =
        await lendingMarketControllerProxy.calculateTotalFundsInBaseCurrency(
          alice.address,
          {
            ccy: targetCurrency,
            claimableAmount: 0,
            debtAmount: 0,
            lentAmount: 0,
            borrowedAmount: 0,
          },
          LIQUIDATION_THRESHOLD_RATE,
        );

      expect(totalFunds.totalWorkingLendOrdersAmount).to.equal('1000000000');
      expect(totalFunds.totalClaimableAmount).to.equal('2000000000');
      expect(totalFunds.totalCollateralAmount).to.equal('3000000000');
      expect(totalFunds.totalLentAmount).to.equal('4000000000');
      expect(totalFunds.totalWorkingBorrowOrdersAmount).to.equal('5000000000');
      expect(totalFunds.totalDebtAmount).to.equal('6000000000');
      expect(totalFunds.totalBorrowedAmount).to.equal('7000000000');
      expect(totalFunds.plusDepositAmountInAdditionalFundsCcy).to.equal('0');
      expect(totalFunds.minusDepositAmountInAdditionalFundsCcy).to.equal('0');
    });

    it('Calculate total funds with positions', async () => {
      await updateReturnValuesOfConvertToBaseCurrencyMock({
        workingLendOrdersAmount: '7000000000',
        claimableAmount: '6000000000',
        collateralAmount: '5000000000',
        lentAmount: '4000000000',
        workingBorrowOrdersAmount: '3000000000',
        debtAmount: '2000000000',
        borrowedAmount: '1000000000',
      });

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '1000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '2000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '2000000000',
          '8000',
        );

      const totalFunds =
        await lendingMarketControllerProxy.calculateTotalFundsInBaseCurrency(
          bob.address,
          {
            ccy: targetCurrency,
            claimableAmount: 0,
            debtAmount: 0,
            lentAmount: 0,
            borrowedAmount: 0,
          },
          LIQUIDATION_THRESHOLD_RATE,
        );

      expect(totalFunds.totalWorkingLendOrdersAmount).to.equal('7000000000');
      expect(totalFunds.totalClaimableAmount).to.equal('6000000000');
      expect(totalFunds.totalCollateralAmount).to.equal('5000000000');
      expect(totalFunds.totalLentAmount).to.equal('4000000000');
      expect(totalFunds.totalWorkingBorrowOrdersAmount).to.equal('3000000000');
      expect(totalFunds.totalDebtAmount).to.equal('2000000000');
      expect(totalFunds.totalBorrowedAmount).to.equal('1000000000');
      expect(totalFunds.plusDepositAmountInAdditionalFundsCcy).to.equal(
        '2000000000',
      );
      expect(totalFunds.minusDepositAmountInAdditionalFundsCcy).to.equal('0');
    });

    it('Calculate total funds with additional lent amount exceeded deposit amount', async () => {
      await updateReturnValuesOfConvertToBaseCurrencyMock({
        workingLendOrdersAmount: '7000000000',
        claimableAmount: '6000000000',
        collateralAmount: '5000000000',
        lentAmount: '4000000000',
        workingBorrowOrdersAmount: '3000000000',
        debtAmount: '2000000000',
        borrowedAmount: '1000000000',
      });

      const totalFunds =
        await lendingMarketControllerProxy.calculateTotalFundsInBaseCurrency(
          alice.address,
          {
            ccy: targetCurrency,
            claimableAmount: 0,
            debtAmount: 0,
            lentAmount: 3000000000,
            borrowedAmount: 0,
          },
          LIQUIDATION_THRESHOLD_RATE,
        );

      expect(totalFunds.totalWorkingLendOrdersAmount).to.equal('7000000000');
      expect(totalFunds.totalClaimableAmount).to.equal('6000000000');
      expect(totalFunds.totalCollateralAmount).to.equal('5000000000');
      expect(totalFunds.totalLentAmount).to.equal('4000000000');
      expect(totalFunds.totalWorkingBorrowOrdersAmount).to.equal('3000000000');
      expect(totalFunds.totalDebtAmount).to.equal('2000000000');
      expect(totalFunds.totalBorrowedAmount).to.equal('1000000000');
      expect(totalFunds.plusDepositAmountInAdditionalFundsCcy).to.equal('0');
      expect(totalFunds.minusDepositAmountInAdditionalFundsCcy).to.equal(
        '3000000000',
      );
    });
  });

  describe('Order Estimations', async () => {
    const conditions = [
      {
        title:
          'Get an borrowing order estimation from one lending order on the order book',
        orders: [
          {
            side: Side.LEND,
            amount: '100000000000000000',
            unitPrice: '8000',
          },
        ],
        input: {
          side: Side.BORROW,
          amount: '100000000000000000',
          unitPrice: '8000',
        },
        result: {
          lastUnitPrice: '8000',
          filledAmount: '100000000000000000',
          filledAmountInFV: calculateFutureValue('100000000000000000', '8000'),
          coverage: '1000',
        },
      },
      {
        title:
          'Get an lending order estimation from one borrowing order on the order book',
        orders: [
          {
            side: Side.BORROW,
            amount: '100000000000000000',
            unitPrice: '8000',
          },
        ],
        input: {
          side: Side.LEND,
          amount: '100000000000000000',
          unitPrice: '8000',
        },
        result: {
          lastUnitPrice: '8000',
          filledAmount: '100000000000000000',
          filledAmountInFV: calculateFutureValue('100000000000000000', '8000'),
          coverage: '1000',
        },
      },
      {
        title: 'Get an order estimation from multiple order on the order book',
        orders: [
          {
            side: Side.LEND,
            amount: '200000000000000000',
            unitPrice: '8000',
          },
          {
            side: Side.LEND,
            amount: '100000000000000000',
            unitPrice: '8010',
          },
        ],
        input: {
          side: Side.BORROW,
          amount: '200000000000000000',
          unitPrice: '8000',
        },
        result: {
          lastUnitPrice: '8000',
          filledAmount: '200000000000000000',
          filledAmountInFV: calculateFutureValue(
            '100000000000000000',
            '8000',
          ).add(calculateFutureValue('100000000000000000', '8010')),
          coverage: '1000',
        },
      },
      {
        title: 'Get an order estimation blocked by the circuit breaker',
        orders: [
          {
            side: Side.LEND,
            amount: '200000000000000000',
            unitPrice: '8000',
          },
          {
            side: Side.LEND,
            amount: '100000000000000000',
            unitPrice: '9000',
          },
        ],
        input: {
          side: Side.BORROW,
          amount: '200000000000000000',
          unitPrice: '8000',
        },
        result: {
          lastUnitPrice: '9000',
          filledAmount: '100000000000000000',
          filledAmountInFV: calculateFutureValue('100000000000000000', '9000'),
          coverage: '1000',
        },
      },
    ];

    for (const condition of conditions) {
      it(condition.title, async () => {
        for (const order of condition.orders) {
          await lendingMarketControllerProxy
            .connect(owner)
            .executeOrder(
              targetCurrency,
              maturities[0],
              order.side,
              order.amount,
              order.unitPrice,
            );
        }

        const estimation = await lendingMarketControllerProxy
          .connect(alice)
          .getOrderEstimation(
            targetCurrency,
            maturities[0],
            condition.input.side,
            condition.input.amount,
            condition.input.unitPrice,
            '0',
            false,
          );

        const { timestamp } = await ethers.provider.getBlock('latest');

        expect(estimation.lastUnitPrice).to.equal(
          condition.result.lastUnitPrice,
        );
        expect(estimation.filledAmount).to.equal(condition.result.filledAmount);
        expect(estimation.filledAmountInFV).to.equal(
          condition.result.filledAmountInFV,
        );
        expect(estimation.coverage).to.equal(condition.result.coverage);

        if (condition.orders.length == 1) {
          expect(
            estimation.orderFeeInFV
              .sub(
                calculateOrderFee(
                  condition.result.filledAmount,
                  condition.result.lastUnitPrice,
                  maturities[0].sub(timestamp),
                ),
              )
              .abs(),
          ).lte(1);
        }
      });
    }
  });
});