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
  ORDER_FEE_RATE,
} from '../../common/constants';
import { calculateFutureValue, calculateOrderFee } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Operations', () => {
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
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    await initialize(targetCurrency);
  });

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();

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
    await mockTokenVault.mock.calculateCoverage.returns(1000);
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
      await lendingMarketControllerProxy.createLendingMarket(
        currency,
        genesisDate,
      );
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  describe('Estimations', async () => {
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
