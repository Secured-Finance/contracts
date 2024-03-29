import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  HAIRCUT,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_THRESHOLD_RATE,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
  PCT_DIGIT,
} from '../../common/constants';
import {
  calculateFutureValue,
  calculateOrderFee,
  calculatePresentValue,
  getAmountWithOrderFee,
} from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Orders', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let mockERC20: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;
  let lendingMarketReader: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;
  let orderActionLogic: Contract;
  let futureValueVault: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockERC20.mock.decimals.returns(18);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ellen] = await ethers.getSigners();

    ({
      mockERC20,
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      beaconProxyControllerProxy,
      lendingMarketControllerProxy,
      lendingMarketReader,
      fundManagementLogic,
      lendingMarketOperationLogic,
      orderActionLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );
    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.cleanUpUsedCurrencies.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.depositWithPermitFrom.returns();
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
  });

  describe('Initialization', async () => {
    it('Initialize the lending market', async () => {
      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        ),
      )
        .to.emit(lendingMarketOperationLogic, 'LendingMarketInitialized')
        .withArgs(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,

          () => true,
          () => true,
        );
    });

    it('Fail to initialize the lending market due to invalid currency', async () => {
      await mockCurrencyController.mock.currencyExists.returns(false);

      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        ),
      ).to.be.revertedWith('InvalidCurrency');
    });

    it('Fail to initialize the lending market due to execution by non-owner', async () => {
      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .initializeLendingMarket(
            targetCurrency,
            genesisDate,
            INITIAL_COMPOUND_FACTOR,
            ORDER_FEE_RATE,
            CIRCUIT_BREAKER_LIMIT_RANGE,
            MIN_DEBT_UNIT_PRICE,
          ),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to initialize the lending market due to too many token decimals', async () => {
      await mockERC20.mock.decimals.returns(45);

      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        ),
      ).revertedWith(`TooManyTokenDecimals("${mockERC20.address}", 45)`);
    });

    it('Get genesisDate', async () => {
      expect(
        await lendingMarketControllerProxy.isInitializedLendingMarket(
          targetCurrency,
        ),
      ).to.equal(false);

      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );
      const res = await lendingMarketControllerProxy.getGenesisDate(
        targetCurrency,
      );

      expect(res).to.equal(genesisDate);
      expect(
        await lendingMarketControllerProxy.isInitializedLendingMarket(
          targetCurrency,
        ),
      ).to.equal(true);
    });

    it('Get beacon proxy implementations', async () => {
      const proxy = await beaconProxyControllerProxy.getBeaconProxyAddress(
        ethers.utils.formatBytes32String('LendingMarket'),
      );

      expect(proxy).to.exist;
      expect(proxy).to.not.equal(ethers.constants.AddressZero);
    });

    it('Fail to get beacon proxy implementations', async () => {
      await expect(
        beaconProxyControllerProxy.getBeaconProxyAddress(
          ethers.utils.formatBytes32String('Test'),
        ),
      ).to.be.revertedWith('NoBeaconProxyContract');
    });

    it('Create a order book', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );
      await lendingMarketControllerProxy.createOrderBook(
        targetCurrency,
        genesisDate,
        genesisDate,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );
      const orderBookIds = await lendingMarketControllerProxy.getOrderBookIds(
        targetCurrency,
      );

      expect(orderBookIds.length).to.equal(1);
      expect(maturities.length).to.equal(1);
      expect(orderBookIds[0]).to.exist;
      expect(orderBookIds[0]).to.not.equal(0);
      expect(moment.unix(maturities[0]).day()).to.equal(5);
      expect(moment.unix(maturities[0]).month()).to.equal(
        moment.unix(genesisDate).add(3, 'M').month(),
      );
    });

    it('Create multiple lending markets', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );

      for (let i = 0; i < 9; i++) {
        await lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate,
        );
      }

      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );
      const orderBookIds = await lendingMarketControllerProxy.getOrderBookIds(
        targetCurrency,
      );

      expect(orderBookIds.length).to.equal(9);
      expect(maturities.length).to.equal(9);
      orderBookIds.forEach((orderBookId) => {
        expect(orderBookId).to.not.equal(0);
        expect(orderBookId).to.exist;
      });

      console.table(
        maturities.map((maturity) => ({
          Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
          'Maturity(Unixtime)': maturity.toString(),
        })),
      );

      maturities.forEach((maturity, i) => {
        expect(moment.unix(maturity).day()).to.equal(5);
        expect(moment.unix(maturity).month()).to.equal(
          moment
            .unix(genesisDate)
            .add(3 * (i + 1), 'M')
            .month(),
        );
      });
    });

    it('Fail to create a order book because market is not initialized', async () => {
      await expect(
        lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate,
        ),
      ).revertedWith('LendingMarketNotInitialized');
    });

    it('Fail to create a order book because currency does not exist', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );

      await mockCurrencyController.mock.currencyExists.returns(false);

      await expect(
        lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate,
        ),
      ).revertedWith('InvalidCurrency');
    });

    it('Fail to create a order book due to invalid pre-opening date', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );

      await expect(
        lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate + 1,
        ),
      ).revertedWith('InvalidPreOpeningDate');
    });

    it('Fail to create a order book due to execution by non-owner', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
      );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .createOrderBook(targetCurrency, genesisDate, genesisDate + 1),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Orders', async () => {
    // let lendingMarketProxies: Contract[];
    let maturities: BigNumber[];
    let orderBookIds: BigNumber[];
    let lendingMarket: Contract;

    const initialize = async (currency: string) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
        MIN_DEBT_UNIT_PRICE,
        // 2400,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createOrderBook(
          currency,
          genesisDate,
          genesisDate - 604800,
        );
      }

      lendingMarket = await lendingMarketControllerProxy
        .getLendingMarket(targetCurrency)
        .then((address) => ethers.getContractAt('LendingMarket', address));

      orderActionLogic = orderActionLogic.attach(lendingMarket.address);

      maturities = await lendingMarketControllerProxy.getMaturities(currency);
      orderBookIds = await lendingMarketControllerProxy.getOrderBookIds(
        targetCurrency,
      );

      futureValueVault = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency)
        .then((address) => ethers.getContractAt('FutureValueVault', address));
    };

    beforeEach(async () => {
      // Set up for the mocks
      await mockTokenVault.mock.isCovered.returns(true, true);

      await initialize(targetCurrency);
    });

    it('Get a market currency data', async () => {
      expect(await lendingMarket.getCurrency()).to.equal(targetCurrency);
    });

    it('Add orders and check rates', async () => {
      const orders = [
        {
          maker: alice,
          side: Side.LEND,
          amount: BigNumber.from('100000000000000000'),
          unitPrice: '9800',
        },
        {
          maker: bob,
          side: Side.LEND,
          amount: BigNumber.from('500000000000000000'),
          unitPrice: '9780',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: BigNumber.from('100000000000000000'),
          unitPrice: '9880',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: BigNumber.from('200000000000000000'),
          unitPrice: '9820',
        },
      ];

      const usedCurrenciesBefore =
        await lendingMarketControllerProxy.getUsedCurrencies(alice.address);
      expect(usedCurrenciesBefore.length).to.equal(0);

      for (const order of orders) {
        await lendingMarketControllerProxy
          .connect(order.maker)
          .executeOrder(
            targetCurrency,
            maturities[3],
            order.side,
            order.amount,
            order.unitPrice,
          );
      }

      const usedCurrenciesAfter =
        await lendingMarketControllerProxy.getUsedCurrencies(alice.address);
      expect(usedCurrenciesAfter.length).to.equal(1);
      expect(usedCurrenciesAfter[0]).to.equal(targetCurrency);

      const borrowOrderBook = await lendingMarket.getBorrowOrderBook(
        orderBookIds[3],
        0,
        10,
      );

      expect(borrowOrderBook.unitPrices[0].toString()).to.equal('9820');
      expect(borrowOrderBook.unitPrices[1].toString()).to.equal('9880');
      expect(borrowOrderBook.unitPrices[2].toString()).to.equal('0');
      expect(borrowOrderBook.unitPrices.length).to.equal(10);
      expect(borrowOrderBook.amounts[0].toString()).to.equal(
        '200000000000000000',
      );
      expect(borrowOrderBook.amounts[1].toString()).to.equal(
        '100000000000000000',
      );
      expect(borrowOrderBook.amounts[2].toString()).to.equal('0');
      expect(borrowOrderBook.amounts.length).to.equal(10);
      expect(borrowOrderBook.quantities[0].toString()).to.equal('1');
      expect(borrowOrderBook.quantities[1].toString()).to.equal('1');
      expect(borrowOrderBook.quantities[2].toString()).to.equal('0');
      expect(borrowOrderBook.quantities.length).to.equal(10);
      expect(borrowOrderBook.next).to.equal(0);

      const lendOrderBook = await lendingMarket.getLendOrderBook(
        orderBookIds[3],
        0,
        10,
      );

      expect(lendOrderBook.unitPrices[0].toString()).to.equal('9800');
      expect(lendOrderBook.unitPrices[1].toString()).to.equal('9780');
      expect(lendOrderBook.unitPrices[2].toString()).to.equal('0');
      expect(lendOrderBook.unitPrices.length).to.equal(10);
      expect(lendOrderBook.amounts[0].toString()).to.equal(
        '100000000000000000',
      );
      expect(lendOrderBook.amounts[1].toString()).to.equal(
        '500000000000000000',
      );
      expect(lendOrderBook.amounts[2].toString()).to.equal('0');
      expect(lendOrderBook.amounts.length).to.equal(10);
      expect(lendOrderBook.quantities[0].toString()).to.equal('1');
      expect(lendOrderBook.quantities[1].toString()).to.equal('1');
      expect(lendOrderBook.quantities[2].toString()).to.equal('0');
      expect(lendOrderBook.quantities.length).to.equal(10);
      expect(lendOrderBook.next).to.equal(0);

      const borrowOrders = await lendingMarketReader.getBorrowOrderBook(
        targetCurrency,
        maturities[3],
        0,
        10,
      );

      for (let i = 0; i < borrowOrders.unitPrices.length; i++) {
        expect(borrowOrderBook.unitPrices[i].toString()).to.equal(
          borrowOrders.unitPrices[i],
        );
        expect(borrowOrderBook.amounts[i].toString()).to.equal(
          borrowOrders.amounts[i],
        );
        expect(borrowOrderBook.quantities[i].toString()).to.equal(
          borrowOrders.quantities[i],
        );
      }

      const lendOrders = await lendingMarketReader.getLendOrderBook(
        targetCurrency,
        maturities[3],
        0,
        10,
      );

      for (let i = 0; i < lendOrders.unitPrices.length; i++) {
        expect(lendOrderBook.unitPrices[i].toString()).to.equal(
          lendOrders.unitPrices[i],
        );
        expect(lendOrderBook.amounts[i].toString()).to.equal(
          lendOrders.amounts[i],
        );
        expect(lendOrderBook.quantities[i].toString()).to.equal(
          lendOrders.quantities[i],
        );
      }
    });

    it('Add orders and rotate markets', async () => {
      const accounts = [alice, bob, carol, mockReserveFund];

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8720',
        )
        .then(async (tx) => {
          await expect(tx).to.not.emit(fundManagementLogic, 'OrderFilled');
          await expect(tx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              alice.address,
              Side.LEND,
              targetCurrency,
              maturities[0],
              '100000000000000000',
              '8720',
              0,
              0,
              0,
              0,
              1,
              '100000000000000000',
              '8720',
              false,
            );
        });

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8720',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8880',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8720',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const maturity = await lendingMarket.getMaturity(orderBookIds[0]);
      expect(moment.unix(maturity).day()).to.equal(5);
      expect(moment.unix(maturity).month()).to.equal(
        moment.unix(genesisDate).add(3, 'M').month(),
      );

      const borrowUnitPrice = await lendingMarket.getBestLendUnitPrice(
        orderBookIds[0],
      );
      expect(borrowUnitPrice.toString()).to.equal('8880');

      const lendUnitPrice = await lendingMarket.getBestBorrowUnitPrice(
        orderBookIds[0],
      );
      expect(lendUnitPrice.toString()).to.equal('8720');

      const showLendingInfo = async (checkValues = false) => {
        const totalPVs = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getTotalPresentValue(
              targetCurrency,
              account.address,
            ),
          ),
        );

        const futureValues0 = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy
              .getPosition(targetCurrency, maturities[0], account.address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        const futureValues1 = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy
              .getPosition(targetCurrency, maturities[1], account.address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        const genesisValues = await Promise.all(
          accounts.map(async (account) => {
            const { amount } =
              await lendingMarketControllerProxy.getGenesisValue(
                targetCurrency,
                account.address,
              );
            return amount;
          }),
        );

        console.table({
          TotalPresentValue: {
            Alice: totalPVs[0].toString(),
            Bob: totalPVs[1].toString(),
            Carol: totalPVs[2].toString(),
            ReserveFund: totalPVs[3].toString(),
          },
          [`FutureValue(${maturities[0]})`]: {
            Alice: futureValues0[0].toString(),
            Bob: futureValues0[1].toString(),
            Carol: futureValues0[2].toString(),
            ReserveFund: futureValues0[3].toString(),
          },
          [`FutureValue(${maturities[1]})`]: {
            Alice: futureValues1[0].toString(),
            Bob: futureValues1[1].toString(),
            Carol: futureValues1[2].toString(),
            ReserveFund: futureValues1[3].toString(),
          },
          ['GenesisValue']: {
            Alice: genesisValues[0].toString(),
            Bob: genesisValues[1].toString(),
            Carol: genesisValues[2].toString(),
            ReserveFund: genesisValues[3].toString(),
          },
        });

        if (checkValues) {
          expect(
            totalPVs
              .reduce((fv, total) => total.add(fv), BigNumber.from(0))
              .abs(),
          ).to.lte(3);

          expect(
            futureValues1
              .reduce((fv, total) => total.add(fv), BigNumber.from(0))
              .abs(),
          ).lte(1);
        }
      };

      expect(await lendingMarket.isOpened(orderBookIds[0])).to.equal(true);

      await expect(
        lendingMarketControllerProxy.cleanUpFunds(
          targetCurrency,
          alice.address,
        ),
      ).to.emit(fundManagementLogic, 'OrdersFilledInAsync');
      await expect(
        lendingMarketControllerProxy.cleanUpFunds(targetCurrency, bob.address),
      ).to.not.emit(fundManagementLogic, 'OrdersFilledInAsync');

      await showLendingInfo();
      await time.increaseTo(maturities[0].toString());

      expect(await lendingMarket.isOpened(orderBookIds[0])).to.equal(false);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8720',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '40000000000000000',
          '8720',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8800',
        );

      await showLendingInfo();

      const borrowUnitPrices = await lendingMarketReader.getBestLendUnitPrices(
        targetCurrency,
      );

      const lendingRates = await lendingMarketReader.getBestBorrowUnitPrices(
        targetCurrency,
      );

      const market = await lendingMarketReader.getOrderBookDetail(
        targetCurrency,
        maturities[0],
      );

      const { blockNumber } =
        await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      const events = await lendingMarketOperationLogic.queryFilter(
        lendingMarketOperationLogic.filters.OrderBooksRotated(),
        blockNumber,
      );

      const newMaturity = events.find(
        ({ event }) => event === 'OrderBooksRotated',
      )?.args?.newMaturity;

      await showLendingInfo();

      const rotatedBorrowRates =
        await lendingMarketReader.getBestLendUnitPrices(targetCurrency);
      const rotatedLendingRates =
        await lendingMarketReader.getBestBorrowUnitPrices(targetCurrency);
      const rotatedMaturities =
        await lendingMarketControllerProxy.getMaturities(targetCurrency);
      const rotatedMarket = await lendingMarketReader.getOrderBookDetail(
        targetCurrency,
        newMaturity,
      );

      // Check borrow rates
      expect(rotatedBorrowRates[0].toString()).to.equal(
        borrowUnitPrices[1].toString(),
      );
      expect(rotatedBorrowRates[1].toString()).to.equal(
        borrowUnitPrices[2].toString(),
      );
      expect(rotatedBorrowRates[2].toString()).to.equal('10000');

      // Check lending rates
      expect(rotatedLendingRates[0].toString()).to.equal(
        lendingRates[1].toString(),
      );
      expect(rotatedLendingRates[1].toString()).to.equal(
        lendingRates[2].toString(),
      );
      expect(rotatedLendingRates[2].toString()).to.equal('0');

      // Check maturities
      expect(rotatedMaturities[0].toString()).to.equal(
        maturities[1].toString(),
      );
      expect(rotatedMaturities[1].toString()).to.equal(
        maturities[2].toString(),
      );
      expect(rotatedMaturities[2].toString()).to.equal(
        maturities[3].toString(),
      );
      expect(rotatedMaturities[3].toString()).to.equal(
        maturities[4].toString(),
      );
      expect(rotatedMaturities[4].toString()).to.equal(newMaturity.toString());

      // Check market data
      expect(market.ccy).to.equal(targetCurrency);
      expect(moment.unix(market.maturity.toString()).day()).to.equal(5);
      expect(moment.unix(market.maturity.toString()).month()).to.equal(
        moment.unix(genesisDate).add(3, 'M').month(),
      );
      expect(market.openingDate).to.equal(genesisDate);
      expect(market.bestLendUnitPrice.toString()).to.equal('8880');
      expect(market.bestBorrowUnitPrice.toString()).to.equal('8720');
      expect(market.marketUnitPrice.toString()).to.equal('8720');
      expect(market.blockUnitPriceHistory[0].toString()).to.equal('8720');

      expect(rotatedMarket.ccy).to.equal(targetCurrency);
      expect(rotatedMarket.maturity.toString()).to.equal(
        newMaturity.toString(),
      );
      expect(rotatedMarket.openingDate).to.equal(maturities[1]);
      expect(rotatedMarket.bestLendUnitPrice.toString()).to.equal('10000');
      expect(rotatedMarket.bestBorrowUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.marketUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.blockUnitPriceHistory[0].toString()).to.equal('0');

      const cleanUpFunds = async () => {
        for (const account of accounts) {
          await lendingMarketControllerProxy.cleanUpFunds(
            targetCurrency,
            account.address,
          );
        }
      };

      await showLendingInfo();
      await cleanUpFunds();
      await showLendingInfo();
      await cleanUpFunds();
      await showLendingInfo(true);
    });

    it('Deposit and add an order', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .depositAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
          { value: '1000000000000000' },
        )
        .then(async (tx) => {
          await expect(tx).to.not.emit(fundManagementLogic, 'OrderFilled');
        });
    });

    it('Deposit and add an order(payable)', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .depositAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
          { value: '1000000000000000' },
        )
        .then(async (tx) => {
          await expect(tx).to.not.emit(fundManagementLogic, 'OrderFilled');
        });
    });

    it('Add multiple orders using multicall', async () => {
      const inputs = [
        [targetCurrency, maturities[0], Side.LEND, '100000000000000', '9880'],
        [targetCurrency, maturities[1], Side.BORROW, '200000000000000', '9800'],
      ];

      await lendingMarketControllerProxy
        .connect(alice)
        .multicall(
          inputs.map((input) =>
            lendingMarketControllerProxy.interface.encodeFunctionData(
              'executeOrder',
              input,
            ),
          ),
        );

      const order1 = await lendingMarket.getOrder(orderBookIds[0], '1');
      const order2 = await lendingMarket.getOrder(orderBookIds[1], '1');

      expect(order1.side).to.equal(Side.LEND);
      expect(order1.unitPrice).to.equal('9880');
      expect(order1.maturity).to.equal(maturities[0]);
      expect(order1.maker).to.equal(alice.address);
      expect(order1.amount).to.equal('100000000000000');
      expect(order1.isPreOrder).to.equal(false);

      expect(order2.side).to.equal(Side.BORROW);
      expect(order2.unitPrice).to.equal('9800');
      expect(order2.maturity).to.equal(maturities[1]);
      expect(order2.maker).to.equal(alice.address);
      expect(order2.amount).to.equal('200000000000000');
      expect(order2.isPreOrder).to.equal(false);
    });

    it('Get an order', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      const order = await lendingMarket.getOrder(orderBookIds[0], '1');

      expect(order.side).to.equal(Side.LEND);
      expect(order.unitPrice).to.equal('9880');
      expect(order.maturity).to.equal(maturities[0]);
      expect(order.maker).to.equal(alice.address);
      expect(order.amount).to.equal('50000000000000000');
      expect(order.isPreOrder).to.equal(false);
    });

    it('Cancel an order', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '880',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .cancelOrder(targetCurrency, maturities[0], '1'),
      ).to.emit(orderActionLogic, 'OrderCanceled');
    });

    it('Get an active order from one market', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(activeOrders.length).to.equal(1);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');
      expect(activeOrders[0].isPreOrder).to.equal(false);
    });

    it('Get active orders from multiple markets', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000001',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000002',
          '9880',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000003',
          '9881',
        );

      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(activeOrders.length).to.equal(4);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');
      expect(activeOrders[0].isPreOrder).to.equal(false);

      expect(activeOrders[1].ccy).to.equal(targetCurrency);
      expect(activeOrders[1].side).to.equal(Side.BORROW);
      expect(activeOrders[1].unitPrice).to.equal('9881');
      expect(activeOrders[1].maturity).to.equal(maturities[0]);
      expect(activeOrders[1].amount).to.equal('50000000000000001');
      expect(activeOrders[1].isPreOrder).to.equal(false);

      expect(activeOrders[2].ccy).to.equal(targetCurrency);
      expect(activeOrders[2].side).to.equal(Side.LEND);
      expect(activeOrders[2].unitPrice).to.equal('9880');
      expect(activeOrders[2].maturity).to.equal(maturities[1]);
      expect(activeOrders[2].amount).to.equal('50000000000000002');
      expect(activeOrders[2].isPreOrder).to.equal(false);

      expect(activeOrders[3].ccy).to.equal(targetCurrency);
      expect(activeOrders[3].side).to.equal(Side.BORROW);
      expect(activeOrders[3].unitPrice).to.equal('9881');
      expect(activeOrders[3].maturity).to.equal(maturities[1]);
      expect(activeOrders[3].amount).to.equal('50000000000000003');
      expect(activeOrders[3].isPreOrder).to.equal(false);
    });

    it('Get active orders from multiple currencies', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000001',
          '9879',
        );

      const targetCurrency2 = ethers.utils.formatBytes32String(`TestCurrency2`);
      await initialize(targetCurrency2);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.BORROW,
          '50000000000000002',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.BORROW,
          '50000000000000003',
          '9882',
        );
      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32[],address)'
      ]([targetCurrency, targetCurrency2], alice.address);

      expect(activeOrders.length).to.equal(4);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');
      expect(activeOrders[0].isPreOrder).to.equal(false);

      expect(activeOrders[1].ccy).to.equal(targetCurrency);
      expect(activeOrders[1].side).to.equal(Side.LEND);
      expect(activeOrders[1].unitPrice).to.equal('9879');
      expect(activeOrders[1].maturity).to.equal(maturities[0]);
      expect(activeOrders[1].amount).to.equal('50000000000000001');
      expect(activeOrders[1].isPreOrder).to.equal(false);

      expect(activeOrders[2].ccy).to.equal(targetCurrency2);
      expect(activeOrders[2].side).to.equal(Side.BORROW);
      expect(activeOrders[2].unitPrice).to.equal('9881');
      expect(activeOrders[2].maturity).to.equal(maturities[0]);
      expect(activeOrders[2].amount).to.equal('50000000000000002');
      expect(activeOrders[2].isPreOrder).to.equal(false);

      expect(activeOrders[3].ccy).to.equal(targetCurrency2);
      expect(activeOrders[3].side).to.equal(Side.BORROW);
      expect(activeOrders[3].unitPrice).to.equal('9882');
      expect(activeOrders[3].maturity).to.equal(maturities[0]);
      expect(activeOrders[3].amount).to.equal('50000000000000003');
      expect(activeOrders[3].isPreOrder).to.equal(false);
    });

    it('Get active orders and inactive orders', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000001',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000001',
          '0',
        );

      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(activeOrders.length).to.equal(1);
      expect(inactiveOrders.length).to.equal(1);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');
      expect(activeOrders[0].isPreOrder).to.equal(false);

      expect(inactiveOrders[0].ccy).to.equal(targetCurrency);
      expect(inactiveOrders[0].side).to.equal(Side.LEND);
      expect(inactiveOrders[0].unitPrice).to.equal('9881');
      expect(inactiveOrders[0].maturity).to.equal(maturities[0]);
      expect(inactiveOrders[0].amount).to.equal('50000000000000001');
      expect(inactiveOrders[0].isPreOrder).to.equal(false);
    });

    it('Get an empty order list', async () => {
      const { activeOrders, inactiveOrders } = await lendingMarketReader[
        'getOrders(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(activeOrders.length).to.equal(0);
      expect(inactiveOrders.length).to.equal(0);
    });

    it('Get an active position from one market', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(1);

      expect(positions[0].ccy).to.equal(targetCurrency);
      expect(positions[0].maturity).to.equal(maturities[0]);
      expect(positions[0].futureValue).to.equal('125000000000000000');
      expect(positions[0].presentValue).to.equal('100000000000000000');
    });

    it('Get active positions of a user who has both side position', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7500',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '7500',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(1);

      expect(positions[0].ccy).to.equal(targetCurrency);
      expect(positions[0].maturity).to.equal(maturities[0]);
      expect(positions[0].futureValue).to.equal('8333333333333333');
      expect(positions[0].presentValue).to.equal('6666666666666666');
    });

    it('Get active positions from multiple markets', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '5000',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '5000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(2);

      expect(positions[0].ccy).to.equal(targetCurrency);
      expect(positions[0].maturity).to.equal(maturities[0]);
      expect(positions[0].futureValue).to.equal('200000000000000000');
      expect(positions[0].presentValue).to.equal('100000000000000000');

      expect(positions[1].ccy).to.equal(targetCurrency);
      expect(positions[1].maturity).to.equal(maturities[1]);
      expect(positions[1].futureValue).to.equal('-125000000000000000');
      expect(positions[1].presentValue).to.equal('-100000000000000000');
    });

    it('Get active positions from multiple currencies', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        );

      const targetCurrency2 = ethers.utils.formatBytes32String(`TestCurrency3`);
      await initialize(targetCurrency2);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '5000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '5000',
        );

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency, targetCurrency2], alice.address);

      expect(positions.length).to.equal(2);

      expect(positions[0].ccy).to.equal(targetCurrency);
      expect(positions[0].maturity).to.equal(maturities[0]);
      expect(positions[0].futureValue).to.equal('-250000000000000000');
      expect(positions[0].presentValue).to.equal('-200000000000000000');

      expect(positions[1].ccy).to.equal(targetCurrency2);
      expect(positions[1].maturity).to.equal(maturities[0]);
      expect(positions[1].futureValue).to.equal('-200000000000000000');
      expect(positions[1].presentValue).to.equal('-100000000000000000');
    });

    it('Get an active position after auto-rolls', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(1);

      expect(positions[0].ccy).to.equal(targetCurrency);
      expect(positions[0].maturity).to.equal(maturities[1]);
      expect(positions[0].futureValue).not.to.equal('0');
      expect(positions[0].presentValue).not.to.equal('0');
    });

    it('Get an empty position list of a user who has an open order', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '5000',
        );

      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(0);
    });

    it('Get an empty position list of a user who has no open order', async () => {
      const positions = await lendingMarketReader[
        'getPositions(bytes32[],address)'
      ]([targetCurrency], alice.address);

      expect(positions.length).to.equal(0);
    });

    it('Fill lending orders and check the total present value', async () => {
      const checkPresentValue = async () => {
        const aliceTotalPV =
          await lendingMarketControllerProxy.getTotalPresentValue(
            targetCurrency,
            alice.address,
          );
        const alicePVs = await Promise.all(
          [0, 1, 2].map((marketNo) =>
            lendingMarketControllerProxy
              .getPosition(targetCurrency, maturities[marketNo], alice.address)
              .then(({ presentValue }) => presentValue),
          ),
        );
        const totalPresentValues = {
          'PresentValue(Alice)': {
            Total: aliceTotalPV.toString(),
            ...alicePVs.reduce((log, pv, idx) => {
              log[`Market${idx}`] = pv.toString();
              return log;
            }, {}),
          },
        };
        console.table(totalPresentValues);
        expect(aliceTotalPV).to.equal(
          alicePVs.reduce((pv, total) => total.add(pv)),
        );
      };

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9900',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9600',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9500',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '8900',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[2],
            Side.BORROW,
            '80000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await checkPresentValue();
    });

    it('Calculate the funds of users who have a large lending position and a small borrowing position', async () => {
      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9600',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9600',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '9600',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '9600',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        )
        .then(({ collateralAmount, claimableAmount, debtAmount }) => {
          expect(claimableAmount).to.equal('100000000000000000');
          expect(debtAmount).to.equal('50000000000000000');
          expect(collateralAmount).to.equal('92500000000000000');
        });

      const totalPresentValue =
        await lendingMarketControllerProxy.getTotalPresentValue(
          targetCurrency,
          alice.address,
        );
      expect(totalPresentValue).to.equal('50000000000000000');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await lendingMarketControllerProxy
        .calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        )
        .then(({ collateralAmount, claimableAmount, debtAmount }) => {
          expect(claimableAmount).not.to.equal('0');
          expect(debtAmount).to.equal('0');
          expect(
            collateralAmount
              .sub(claimableAmount.mul(HAIRCUT).div(PCT_DIGIT))
              .abs(),
          ).lte(1);
        });
    });

    it('Calculate the funds of users who have a small lending position and a large borrowing position', async () => {
      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9600',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9600',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '9600',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '50000000000000000',
            '9600',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        )
        .then(({ collateralAmount, claimableAmount, debtAmount }) => {
          expect(claimableAmount).to.equal('50000000000000000');
          expect(debtAmount).to.equal('100000000000000000');
          expect(collateralAmount).to.equal('50000000000000000');
        });

      const totalPresentValue =
        await lendingMarketControllerProxy.getTotalPresentValue(
          targetCurrency,
          alice.address,
        );
      expect(totalPresentValue).to.equal('-50000000000000000');

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await lendingMarketControllerProxy
        .calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        )
        .then(({ collateralAmount, claimableAmount, debtAmount }) => {
          expect(claimableAmount).to.equal('0');
          expect(debtAmount).not.to.equal('0');
          expect(collateralAmount).to.equal('0');
        });
    });

    it('Fill lending orders and partially fill own order.', async () => {
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '150000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const totalLendingSupplyBefore =
        await futureValueVault.getTotalLendingSupply(maturities[0]);
      const totalBorrowingSupplyBefore =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);
      const pendingOrderAmountBefore =
        await lendingMarketControllerProxy.getPendingOrderAmount(
          targetCurrency,
          maturities[0],
        );

      expect(totalBorrowingSupplyBefore.sub(totalLendingSupplyBefore)).to.equal(
        calculateFutureValue('100000000000000000', '8000'),
      );
      expect(pendingOrderAmountBefore).to.equal('100000000000000000');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );

      const [aliceFV, bobFV, reserveFundFV] = await Promise.all(
        [alice, bob, mockReserveFund].map(async (user) => {
          const { futureValue } =
            await lendingMarketControllerProxy.getPosition(
              targetCurrency,
              maturities[0],
              user.address,
            );
          return futureValue;
        }),
      );

      const totalLendingSupply = await futureValueVault.getTotalLendingSupply(
        maturities[0],
      );
      const totalBorrowingSupply =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);
      const pendingOrderAmount =
        await lendingMarketControllerProxy.getPendingOrderAmount(
          targetCurrency,
          maturities[0],
        );

      expect(aliceFV.abs()).to.equal(totalBorrowingSupply);
      expect(bobFV.add(reserveFundFV)).to.equal(totalLendingSupply);
      expect(totalBorrowingSupply).to.equal(totalLendingSupply);
      expect(pendingOrderAmount).to.equal('0');

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );

      const { futureValue: aliceFV2 } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );
      const { futureValue: carolFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          carol.address,
        );
      const totalBorrowingSupply2 =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);

      expect(aliceFV2.add(carolFV).abs()).to.equal(totalBorrowingSupply2);
    });

    it('Fill lending orders including own order', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '150000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );

      const { futureValue: aliceFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );
      const totalBorrowingSupply =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);

      expect(aliceFV.abs()).to.equal(totalBorrowingSupply);
    });

    it('Fill borrowing orders including own order', async () => {
      const { futureValue: reserveFundFVBefore } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          mockReserveFund.address,
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '150000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );

      const { futureValue: aliceFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );
      const { futureValue: reserveFundFVAfter } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          mockReserveFund.address,
        );
      const totalLendingSupply = await futureValueVault.getTotalLendingSupply(
        maturities[0],
      );

      expect(
        aliceFV.abs().add(reserveFundFVAfter).sub(reserveFundFVBefore),
      ).to.equal(totalLendingSupply);
    });

    it("Fill lending orders including another user's order for unwinding", async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '150000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const totalLendingSupplyBefore =
        await futureValueVault.getTotalLendingSupply(maturities[0]);
      const totalBorrowingSupplyBefore =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);
      const pendingOrderAmountBefore =
        await lendingMarketControllerProxy.getPendingOrderAmount(
          targetCurrency,
          maturities[0],
        );

      expect(totalLendingSupplyBefore.sub(totalBorrowingSupplyBefore)).to.equal(
        calculateFutureValue('100000000000000000', '8000'),
      );
      expect(pendingOrderAmountBefore).to.equal('100000000000000000');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );

      const { futureValue: aliceFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );
      const { futureValue: carolFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          carol.address,
        );
      const totalLendingSupply = await futureValueVault.getTotalLendingSupply(
        maturities[0],
      );
      const totalBorrowingSupply =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);

      expect(aliceFV.abs()).to.equal(0);
      expect(carolFV.abs()).to.equal(totalBorrowingSupply);
      expect(totalLendingSupply).to.equal(totalBorrowingSupply);
    });

    it('Fill multiple lending orders without partially filled orders', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '150000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const totalLendingSupplyBefore =
        await futureValueVault.getTotalLendingSupply(maturities[0]);
      const totalBorrowingSupplyBefore =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);
      const pendingOrderAmountBefore =
        await lendingMarketControllerProxy.getPendingOrderAmount(
          targetCurrency,
          maturities[0],
        );

      expect(totalBorrowingSupplyBefore.sub(totalLendingSupplyBefore)).to.equal(
        calculateFutureValue('150000000000000000', '8000'),
      );
      expect(pendingOrderAmountBefore).to.equal('150000000000000000');

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );
      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );

      const totalLendingSupply = await futureValueVault.getTotalLendingSupply(
        maturities[0],
      );
      const totalBorrowingSupply =
        await futureValueVault.getTotalBorrowingSupply(maturities[0]);
      const pendingOrderAmount =
        await lendingMarketControllerProxy.getPendingOrderAmount(
          targetCurrency,
          maturities[0],
        );

      expect(totalLendingSupply).to.equal(totalBorrowingSupply);
      expect(pendingOrderAmount).to.equal('0');
    });

    describe('Limit Order', async () => {
      it('Fill all lending orders at one rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8800',
          );

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            Side.BORROW,
            targetCurrency,
            maturities[0],
            '100000000000000000',
            '8800',
            '100000000000000000',
            '8800',
            calculateFutureValue('100000000000000000', '8800'),
            calculateOrderFee(
              '100000000000000000',
              '8800',
              maturities[0].sub(timestamp),
            ),
            0,
            0,
            0,
            false,
          );
      });

      it('Fill all borrowing orders at one rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8800',
          );

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            Side.LEND,
            targetCurrency,
            maturities[0],
            '100000000000000000',
            '8800',
            '100000000000000000',
            '8800',
            calculateFutureValue('100000000000000000', '8800'),
            calculateOrderFee(
              '100000000000000000',
              '8800',
              maturities[0].sub(timestamp),
            ),
            0,
            0,
            0,
            false,
          );
      });

      it('Fill orders partially at one rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(dave)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(ellen)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8800',
          );

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            ellen.address,
            Side.BORROW,
            targetCurrency,
            maturities[0],
            '100000000000000000',
            '8800',
            '100000000000000000',
            '8800',
            calculateFutureValue('200000000000000000', '8800').sub(
              calculateFutureValue('100000000000000000', '8800'),
            ),
            calculateOrderFee(
              '100000000000000000',
              '8800',
              maturities[0].sub(timestamp),
            ),
            0,
            0,
            0,
            false,
          );
      });

      it('Fill orders at one rate with a partial amount with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8000',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '80000000000000000',
            '8000',
          );

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
        await expect(tx)
          .to.emit(fundManagementLogic, 'OrderPartiallyFilled')
          .withArgs(
            () => true,
            bob.address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            '30000000000000000',
            '37500000000000000',
          );
        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            Side.BORROW,
            targetCurrency,
            maturities[0],
            '80000000000000000',
            '8000',
            '80000000000000000',
            '8000',
            calculateFutureValue('80000000000000000', '8000'),
            calculateOrderFee(
              '80000000000000000',
              '8000',
              maturities[0].sub(timestamp),
            ),
            0,
            0,
            0,
            false,
          );
      });

      it('Fill orders at one rate with a over amount with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '120000000000000000',
            '8800',
          );

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            Side.BORROW,
            targetCurrency,
            maturities[0],
            '120000000000000000',
            '8800',
            '100000000000000000',
            '8800',
            calculateFutureValue('100000000000000000', '8800'),
            calculateOrderFee(
              '100000000000000000',
              '8800',
              maturities[0].sub(timestamp),
            ),
            3,
            '20000000000000000',
            '8800',
            false,
          );
      });

      it('Fill an own order', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '8798',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8801',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill an order partially out of the orders held', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '50000000000000000',
              '8798',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill multiple orders partially out of the orders held', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8798',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8797',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8799',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8798',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8798',
          );
      });

      it('Fill 100 orders in same rate', async () => {
        let totalAmount = BigNumber.from(0);
        const orderAmount = '50000000000000000';
        const users = await ethers.getSigners();

        for (let i = 0; i < 100; i++) {
          totalAmount = totalAmount.add(orderAmount);
          await lendingMarketControllerProxy
            .connect(users[i % users.length])
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              orderAmount,
              '9880',
            );
        }

        await expect(
          lendingMarketControllerProxy
            .connect(users[0])
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              totalAmount.toString(),
              '9880',
            ),
        )
          .to.emit(fundManagementLogic, 'OrderFilled')
          .withArgs(
            users[0].address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            totalAmount,
            () => true, // any value
            () => true, // any value
          );
      });

      it('Fill 100 orders in different rate', async () => {
        let totalAmount = BigNumber.from(0);
        const orderAmount = '50000000000000000';
        const users = await ethers.getSigners();

        for (let i = 0; i < 100; i++) {
          totalAmount = totalAmount.add(orderAmount);
          await lendingMarketControllerProxy
            .connect(users[i % users.length])
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              orderAmount,
              String(8500 - i),
            );
        }

        await expect(
          lendingMarketControllerProxy
            .connect(users[0])
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              totalAmount.toString(),
              '8500',
            ),
        )
          .to.emit(fundManagementLogic, 'OrderFilled')
          .withArgs(
            users[0].address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            totalAmount,
            () => true, // any value
            () => true, // any value
          );
      });

      it('Deposit and place a lending order with permit', async () => {
        const deadline = ethers.constants.MaxUint256;
        const v = 1;
        const r = ethers.utils.formatBytes32String('dummy');
        const s = ethers.utils.formatBytes32String('dummy');

        await lendingMarketControllerProxy
          .connect(alice)
          .depositWithPermitAndExecuteOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
            deadline,
            v,
            r,
            s,
          );
      });
    });

    describe('Market Order', async () => {
      it('Fail to place a borrow market order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '0',
            ),
        ).to.be.revertedWith('EmptyOrderBook');
      });

      it('Fail to place a lend market order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .depositAndExecuteOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '0',
              { value: '1000000000000000' },
            ),
        ).to.be.revertedWith('EmptyOrderBook');
      });
    });

    describe('Unwinding', async () => {
      it('Unwind a lending order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '40000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '20000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const tx = await lendingMarketControllerProxy
          .connect(alice)
          .unwindPosition(targetCurrency, maturities[0]);
        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx)
          .to.emit(fundManagementLogic, 'OrderFilled')
          .withArgs(
            alice.address,
            targetCurrency,
            Side.BORROW,
            maturities[0],
            () => true, // any value
            getAmountWithOrderFee(
              Side.BORROW,
              BigNumber.from('12500000000000000'),
              maturities[0].sub(timestamp),
            ),
            () => true, // any value
          );

        const partiallyFilledAmount = calculatePresentValue(
          getAmountWithOrderFee(
            Side.BORROW,
            BigNumber.from('12500000000000000'),
            maturities[0].sub(timestamp),
          ),
          '8000',
        );

        await expect(tx)
          .to.emit(fundManagementLogic, 'OrderPartiallyFilled')
          .withArgs(
            () => true,
            bob.address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            partiallyFilledAmount,
            calculateFutureValue(partiallyFilledAmount, '8000'),
          );

        const { futureValue: aliceFV } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal('0');
      });

      it('Unwind a borrowing order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '20000000000000000',
              '8200',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '5000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '5000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const tx = await lendingMarketControllerProxy
          .connect(alice)
          .unwindPosition(targetCurrency, maturities[0]);
        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx)
          .to.emit(fundManagementLogic, 'OrderFilled')
          .withArgs(
            alice.address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            () => true, // any value
            getAmountWithOrderFee(
              Side.LEND,
              BigNumber.from('12500000000000000'),
              maturities[0].sub(timestamp),
            ),
            () => true, // any value
          );

        const { futureValue: aliceFV } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal('0');
      });

      it("Unwind a order at the order book that don't has enough orders", async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '20000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '9000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const tx = await lendingMarketControllerProxy
          .connect(alice)
          .unwindPosition(targetCurrency, maturities[0]);
        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

        await expect(tx)
          .to.emit(fundManagementLogic, 'OrderFilled')
          .withArgs(
            alice.address,
            targetCurrency,
            Side.BORROW,
            maturities[0],
            () => true, // any value
            getAmountWithOrderFee(
              Side.BORROW,
              BigNumber.from('11250000000000000'),
              maturities[0].sub(timestamp),
            ),
            () => true, // any value
          );

        const { futureValue: aliceFV } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal('1250000000000000');
      });

      it("Unwind a order ta the order book that don't has any orders", async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        ).to.be.revertedWith('EmptyOrderBook');

        const { futureValue: aliceFV } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal('-12500000000000000');
      });

      it('Fail to execute unwinding due to insufficient collateral', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '40000000000000000',
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '20000000000000000',
              '8000',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await mockTokenVault.mock.isCovered.returns(false, true);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        ).to.be.revertedWith('NotEnoughCollateral');
      });

      it('Fail to execute unwinding due to no future values user has', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        ).to.be.revertedWith('FutureValueIsZero');
      });

      it('Fail to execute unwinding due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, '1'),
        ).to.be.revertedWith('InvalidMaturity');
      });
    });

    describe('Order Book', async () => {
      beforeEach(async () => {
        const orderCount = 10;

        for (let i = 0; i < orderCount; i++) {
          await lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              i < orderCount / 2 ? Side.BORROW : Side.LEND,
              BigNumber.from('100000000000000000'),
              9950 - i * 2,
            );
        }
      });

      it('Get all borrow orders', async () => {
        const { unitPrices, next } = await lendingMarket.getBorrowOrderBook(
          orderBookIds[0],
          0,
          5,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(5);
        expect(next).to.equal(0);
      });

      it('Get all lend orders', async () => {
        const { unitPrices, next } = await lendingMarket.getLendOrderBook(
          orderBookIds[0],
          0,
          5,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(5);
        expect(next).to.equal(0);
      });

      it('Get all borrow orders in multiple calls', async () => {
        const orderBook1 = await lendingMarket.getBorrowOrderBook(
          orderBookIds[0],
          0,
          3,
        );

        const orderBook2 = await lendingMarket.getBorrowOrderBook(
          orderBookIds[0],
          orderBook1.next,
          3,
        );

        expect(
          orderBook1.unitPrices.filter((v) => v.toNumber()).length,
        ).to.equal(3);
        expect(orderBook1.next).to.equal(9948);
        expect(
          orderBook2.unitPrices.filter((v) => v.toNumber()).length,
        ).to.equal(2);
        expect(orderBook2.next).to.equal(0);
      });

      it('Get all lend orders in multiple calls', async () => {
        const orderBook1 = await lendingMarket.getLendOrderBook(
          orderBookIds[0],
          0,
          3,
        );

        const orderBook2 = await lendingMarket.getLendOrderBook(
          orderBookIds[0],
          orderBook1.next,
          3,
        );

        expect(
          orderBook1.unitPrices.filter((v) => v.toNumber()).length,
        ).to.equal(3);
        expect(orderBook1.next).to.equal(9934);
        expect(
          orderBook2.unitPrices.filter((v) => v.toNumber()).length,
        ).to.equal(2);
        expect(orderBook2.next).to.equal(0);
      });

      it('Get borrow orders starting from a non-existent unit price', async () => {
        const { unitPrices, next } = await lendingMarket.getBorrowOrderBook(
          orderBookIds[0],
          9943,
          3,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(3);
        expect(next).to.equal(9950);
      });

      it('Get lend orders starting from a non-existent unit price', async () => {
        const { unitPrices, next } = await lendingMarket.getLendOrderBook(
          orderBookIds[0],
          9939,
          3,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(3);
        expect(next).to.equal(9932);
      });

      it('Get borrow orders starting from the minimum unit price', async () => {
        const { unitPrices, next } = await lendingMarket.getBorrowOrderBook(
          orderBookIds[0],
          1,
          5,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(5);
        expect(next).to.equal(0);
      });

      it('Get borrow orders starting from the maximum unit price', async () => {
        const { unitPrices, next } = await lendingMarket.getLendOrderBook(
          orderBookIds[0],
          10000,
          5,
        );

        expect(unitPrices.filter((v) => v.toNumber()).length).to.equal(5);
        expect(next).to.equal(0);
      });
    });

    describe('Failure', async () => {
      it('Fail to create an order due to insufficient collateral', async () => {
        await mockTokenVault.mock.isCovered.returns(false, true);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8000',
            ),
        ).not.to.be.revertedWith(`NotEnoughDeposit${targetCurrency}`);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '8000',
            ),
        ).to.be.revertedWith('NotEnoughCollateral');
      });

      it('Fail to create an order due to too many orders', async () => {
        for (let i = 0; i < 20; i++) {
          await lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8000',
            );
        }

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8000',
            ),
        ).to.be.revertedWith('TooManyActiveOrders');
      });

      it('Fail to create an order due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              '1',
              Side.LEND,
              '100000000000000000',
              '8000',
            ),
        ).to.be.revertedWith('InvalidMaturity');
      });

      it('Fail to create an order and deposit token due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .depositAndExecuteOrder(
              targetCurrency,
              '1',
              Side.LEND,
              '10000000000000000',
              '0',
            ),
        ).to.be.revertedWith('InvalidMaturity');
      });

      it('Fail to create an order and deposit token with permit due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .depositWithPermitAndExecuteOrder(
              targetCurrency,
              1,
              Side.LEND,
              '10000000000000000',
              '0',
              ethers.constants.MaxUint256,
              1,
              ethers.utils.formatBytes32String('dummy'),
              ethers.utils.formatBytes32String('dummy'),
            ),
        ).to.be.revertedWith('InvalidMaturity');
      });

      it('Fail to cancel an order due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .cancelOrder(targetCurrency, '1', '1'),
        ).to.be.revertedWith('InvalidMaturity');
      });

      it('Fail to rotate lending markets due to pre-maturity', async () => {
        await expect(
          lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
        ).to.be.revertedWith('OrderBookNotMatured');
      });

      it('Fail to cancel an order due to execution by non-maker', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .cancelOrder(targetCurrency, maturities[0], '1'),
        ).to.be.revertedWith('CallerNotMaker');
      });

      it('Fail to cancel an order due to invalid order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .cancelOrder(targetCurrency, maturities[0], '10'),
        ).to.be.revertedWith('NoOrderExists');
      });
    });
  });
});
