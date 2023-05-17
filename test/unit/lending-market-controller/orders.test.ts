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
  AUTO_ROLL_FEE_RATE,
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { deployContracts } from './utils';

describe('LendingMarketController - Orders', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;

  let fundManagementLogic: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ellen, ...signers] =
      await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      beaconProxyControllerProxy,
      lendingMarketControllerProxy,
      fundManagementLogic,
    } = await deployContracts(owner));

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
  });

  describe('Initialization', async () => {
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
        AUTO_ROLL_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
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
      ).to.be.revertedWith('Beacon proxy address not found');
    });

    it('Create a lending market', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );
      await lendingMarketControllerProxy.createLendingMarket(
        targetCurrency,
        genesisDate,
      );
      const markets = await lendingMarketControllerProxy.getLendingMarkets(
        targetCurrency,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );
      const market = await lendingMarketControllerProxy.getLendingMarket(
        targetCurrency,
        maturities[0],
      );

      expect(markets.length).to.equal(1);
      expect(maturities.length).to.equal(1);
      expect(markets[0]).to.exist;
      expect(markets[0]).to.not.equal(ethers.constants.AddressZero);
      expect(markets[0]).to.equal(market);
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
        AUTO_ROLL_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      for (let i = 0; i < 9; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          targetCurrency,
          genesisDate,
        );
      }

      const markets = await lendingMarketControllerProxy.getLendingMarkets(
        targetCurrency,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      expect(markets.length).to.equal(9);
      expect(maturities.length).to.equal(9);
      markets.forEach((market) => {
        expect(market).to.not.equal(ethers.constants.AddressZero);
        expect(market).to.exist;
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
  });

  describe('Orders', async () => {
    let lendingMarketProxies: Contract[];
    let maturities: BigNumber[];

    const initialize = async (currency: string) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          currency,
          genesisDate,
        );
      }

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(currency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      );

      maturities = await lendingMarketControllerProxy.getMaturities(currency);
    };

    beforeEach(async () => {
      // Set up for the mocks
      await mockTokenVault.mock.isCovered.returns(true);

      await initialize(targetCurrency);
    });

    it('Get a market currency data', async () => {
      const lendingMarket = lendingMarketProxies[0];
      expect(await lendingMarket.getCurrency()).to.equal(targetCurrency);
    });

    it('Add orders and check rates', async () => {
      const lendingMarket3 = lendingMarketProxies[3];

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
          .createOrder(
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

      const borrowUnitPrices = await lendingMarket3.getBorrowOrderBook(10);
      expect(borrowUnitPrices.unitPrices[0].toString()).to.equal('9820');
      expect(borrowUnitPrices.unitPrices[1].toString()).to.equal('9880');
      expect(borrowUnitPrices.unitPrices[2].toString()).to.equal('0');
      expect(borrowUnitPrices.unitPrices.length).to.equal(10);
      expect(borrowUnitPrices.amounts[0].toString()).to.equal(
        '200000000000000000',
      );
      expect(borrowUnitPrices.amounts[1].toString()).to.equal(
        '100000000000000000',
      );
      expect(borrowUnitPrices.amounts[2].toString()).to.equal('0');
      expect(borrowUnitPrices.amounts.length).to.equal(10);
      expect(borrowUnitPrices.quantities[0].toString()).to.equal('1');
      expect(borrowUnitPrices.quantities[1].toString()).to.equal('1');
      expect(borrowUnitPrices.quantities[2].toString()).to.equal('0');
      expect(borrowUnitPrices.quantities.length).to.equal(10);

      const lendUnitPrices = await lendingMarket3.getLendOrderBook(10);
      expect(lendUnitPrices.unitPrices[0].toString()).to.equal('9800');
      expect(lendUnitPrices.unitPrices[1].toString()).to.equal('9780');
      expect(lendUnitPrices.unitPrices[2].toString()).to.equal('0');
      expect(lendUnitPrices.unitPrices.length).to.equal(10);
      expect(lendUnitPrices.amounts[0].toString()).to.equal(
        '100000000000000000',
      );
      expect(lendUnitPrices.amounts[1].toString()).to.equal(
        '500000000000000000',
      );
      expect(lendUnitPrices.amounts[2].toString()).to.equal('0');
      expect(lendUnitPrices.amounts.length).to.equal(10);
      expect(lendUnitPrices.quantities[0].toString()).to.equal('1');
      expect(lendUnitPrices.quantities[1].toString()).to.equal('1');
      expect(lendUnitPrices.quantities[2].toString()).to.equal('0');
      expect(lendUnitPrices.quantities.length).to.equal(10);

      const borrowOrders =
        await lendingMarketControllerProxy.getBorrowOrderBook(
          targetCurrency,
          maturities[3],
          10,
        );

      for (let i = 0; i < borrowOrders.unitPrices.length; i++) {
        expect(borrowUnitPrices.unitPrices[i].toString()).to.equal(
          borrowOrders.unitPrices[i],
        );
        expect(borrowUnitPrices.amounts[i].toString()).to.equal(
          borrowOrders.amounts[i],
        );
        expect(borrowUnitPrices.quantities[i].toString()).to.equal(
          borrowOrders.quantities[i],
        );
      }

      const lendOrders = await lendingMarketControllerProxy.getLendOrderBook(
        targetCurrency,
        maturities[3],
        10,
      );

      for (let i = 0; i < lendOrders.unitPrices.length; i++) {
        expect(lendUnitPrices.unitPrices[i].toString()).to.equal(
          lendOrders.unitPrices[i],
        );
        expect(lendUnitPrices.amounts[i].toString()).to.equal(
          lendOrders.amounts[i],
        );
        expect(lendUnitPrices.quantities[i].toString()).to.equal(
          lendOrders.quantities[i],
        );
      }
    });

    it('Add orders and rotate markets', async () => {
      const accounts = [alice, bob, carol, mockReserveFund];
      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8720',
        )
        .then(async (tx) => {
          await expect(tx).to.emit(lendingMarket1, 'OrderMade');
          await expect(tx).to.not.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          );
        });

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8720',
        )
        .then((tx) => expect(tx).to.emit(lendingMarket1, 'OrderMade'));

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8880',
        )
        .then((tx) => expect(tx).to.emit(lendingMarket1, 'OrderMade'));

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8720',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrderFilled',
      );

      const maturity = await lendingMarket1.getMaturity();
      expect(moment.unix(maturity).day()).to.equal(5);
      expect(moment.unix(maturity).month()).to.equal(
        moment.unix(genesisDate).add(3, 'M').month(),
      );

      const borrowUnitPrice = await lendingMarket1.getBorrowUnitPrice();
      expect(borrowUnitPrice.toString()).to.equal('8880');

      const lendUnitPrice = await lendingMarket1.getLendUnitPrice();
      expect(lendUnitPrice.toString()).to.equal('8720');

      const midUnitPrice = await lendingMarket1.getMidUnitPrice();
      expect(midUnitPrice.toString()).to.equal('8800');

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
            lendingMarketControllerProxy.getFutureValue(
              targetCurrency,
              maturities[0],
              account.address,
            ),
          ),
        );

        const futureValues1 = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getFutureValue(
              targetCurrency,
              maturities[1],
              account.address,
            ),
          ),
        );

        const genesisValues = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getGenesisValue(
              targetCurrency,
              account.address,
            ),
          ),
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

      expect(await lendingMarket1.isOpened()).to.equal(true);

      await expect(
        lendingMarketControllerProxy.cleanUpFunds(
          targetCurrency,
          alice.address,
        ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrdersFilledInAsync',
      );
      await expect(
        lendingMarketControllerProxy.cleanUpFunds(targetCurrency, bob.address),
      ).to.not.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrdersFilledInAsync',
      );

      await showLendingInfo();
      await time.increaseTo(maturities[0].toString());

      expect(await lendingMarket1.isOpened()).to.equal(false);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8720',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '40000000000000000',
          '8720',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8800',
        );

      await showLendingInfo();

      const borrowUnitPrices =
        await lendingMarketControllerProxy.getBorrowUnitPrices(targetCurrency);

      const lendingRates = await lendingMarketControllerProxy.getLendUnitPrices(
        targetCurrency,
      );
      const midUnitPrices = await lendingMarketControllerProxy.getMidUnitPrices(
        targetCurrency,
      );
      const market = await lendingMarket1.getMarket();

      const { newMaturity } = await lendingMarketControllerProxy
        .rotateLendingMarkets(targetCurrency)
        .then((tx) => tx.wait())
        .then(
          ({ events }) =>
            events.find(({ event }) => event === 'LendingMarketsRotated').args,
        );

      await showLendingInfo();

      const rotatedBorrowRates =
        await lendingMarketControllerProxy.getBorrowUnitPrices(targetCurrency);
      const rotatedLendingRates =
        await lendingMarketControllerProxy.getLendUnitPrices(targetCurrency);
      const rotatedMidRates =
        await lendingMarketControllerProxy.getMidUnitPrices(targetCurrency);
      const rotatedMaturities =
        await lendingMarketControllerProxy.getMaturities(targetCurrency);
      const rotatedMarket = await lendingMarket1.getMarket();

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

      // Check mid rates
      expect(rotatedMidRates[0].toString()).to.equal(
        midUnitPrices[1].toString(),
      );
      expect(rotatedMidRates[1].toString()).to.equal(
        midUnitPrices[2].toString(),
      );
      expect(rotatedMidRates[2].toString()).to.equal('5000');

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
      expect(market.borrowUnitPrice.toString()).to.equal('8880');
      expect(market.lendUnitPrice.toString()).to.equal('8720');
      expect(market.midUnitPrice.toString()).to.equal('8800');

      expect(rotatedMarket.ccy).to.equal(targetCurrency);
      expect(rotatedMarket.maturity.toString()).to.equal(
        newMaturity.toString(),
      );
      expect(rotatedMarket.openingDate).to.equal(maturities[1]);
      expect(rotatedMarket.borrowUnitPrice.toString()).to.equal('10000');
      expect(rotatedMarket.lendUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.midUnitPrice.toString()).to.equal('5000');

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
        .depositAndCreateOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
          { value: '1000000000000000' },
        )
        .then(async (tx) => {
          await expect(tx).to.not.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          );
        });
    });

    it('Deposit and add an order(payable)', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .depositAndCreateOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
          { value: '1000000000000000' },
        )
        .then(async (tx) => {
          await expect(tx).to.not.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          );
        });
    });

    it('Get an order', async () => {
      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      const order = await lendingMarket1.getOrder('1');

      expect(order.side).to.equal(Side.LEND);
      expect(order.unitPrice).to.equal('9880');
      expect(order.maturity).to.equal(maturities[0]);
      expect(order.maker).to.equal(alice.address);
      expect(order.amount).to.equal('50000000000000000');
    });

    it('Cancel an order', async () => {
      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
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
      ).to.emit(lendingMarket1, 'OrderCanceled');
    });

    it('Get an active order of one market', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      const { activeOrders, inactiveOrders } =
        await lendingMarketControllerProxy.getOrders(
          [targetCurrency],
          alice.address,
        );

      expect(activeOrders.length).to.equal(1);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');
    });

    it('Get active orders of multiple markets', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000001',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000002',
          '9880',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000003',
          '9881',
        );

      const { activeOrders, inactiveOrders } =
        await lendingMarketControllerProxy.getOrders(
          [targetCurrency],
          alice.address,
        );

      expect(activeOrders.length).to.equal(4);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');

      expect(activeOrders[1].ccy).to.equal(targetCurrency);
      expect(activeOrders[1].side).to.equal(Side.BORROW);
      expect(activeOrders[1].unitPrice).to.equal('9881');
      expect(activeOrders[1].maturity).to.equal(maturities[0]);
      expect(activeOrders[1].amount).to.equal('50000000000000001');

      expect(activeOrders[2].ccy).to.equal(targetCurrency);
      expect(activeOrders[2].side).to.equal(Side.LEND);
      expect(activeOrders[2].unitPrice).to.equal('9880');
      expect(activeOrders[2].maturity).to.equal(maturities[1]);
      expect(activeOrders[2].amount).to.equal('50000000000000002');

      expect(activeOrders[3].ccy).to.equal(targetCurrency);
      expect(activeOrders[3].side).to.equal(Side.BORROW);
      expect(activeOrders[3].unitPrice).to.equal('9881');
      expect(activeOrders[3].maturity).to.equal(maturities[1]);
      expect(activeOrders[3].amount).to.equal('50000000000000003');
    });

    it('Get active orders of multiple currencies', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
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
        .createOrder(
          targetCurrency2,
          maturities[0],
          Side.BORROW,
          '50000000000000002',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency2,
          maturities[0],
          Side.BORROW,
          '50000000000000003',
          '9882',
        );
      const { activeOrders, inactiveOrders } =
        await lendingMarketControllerProxy.getOrders(
          [targetCurrency, targetCurrency2],
          alice.address,
        );

      expect(activeOrders.length).to.equal(4);
      expect(inactiveOrders.length).to.equal(0);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');

      expect(activeOrders[1].ccy).to.equal(targetCurrency);
      expect(activeOrders[1].side).to.equal(Side.LEND);
      expect(activeOrders[1].unitPrice).to.equal('9879');
      expect(activeOrders[1].maturity).to.equal(maturities[0]);
      expect(activeOrders[1].amount).to.equal('50000000000000001');

      expect(activeOrders[2].ccy).to.equal(targetCurrency2);
      expect(activeOrders[2].side).to.equal(Side.BORROW);
      expect(activeOrders[2].unitPrice).to.equal('9881');
      expect(activeOrders[2].maturity).to.equal(maturities[0]);
      expect(activeOrders[2].amount).to.equal('50000000000000002');

      expect(activeOrders[3].ccy).to.equal(targetCurrency2);
      expect(activeOrders[3].side).to.equal(Side.BORROW);
      expect(activeOrders[3].unitPrice).to.equal('9882');
      expect(activeOrders[3].maturity).to.equal(maturities[0]);
      expect(activeOrders[3].amount).to.equal('50000000000000003');
    });

    it('Get active orders and inactive orders', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000001',
          '9881',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000001',
          '0',
        );

      const { activeOrders, inactiveOrders } =
        await lendingMarketControllerProxy.getOrders(
          [targetCurrency],
          alice.address,
        );

      expect(activeOrders.length).to.equal(1);
      expect(inactiveOrders.length).to.equal(1);

      expect(activeOrders[0].ccy).to.equal(targetCurrency);
      expect(activeOrders[0].side).to.equal(Side.LEND);
      expect(activeOrders[0].unitPrice).to.equal('9880');
      expect(activeOrders[0].maturity).to.equal(maturities[0]);
      expect(activeOrders[0].amount).to.equal('50000000000000000');

      expect(inactiveOrders[0].ccy).to.equal(targetCurrency);
      expect(inactiveOrders[0].side).to.equal(Side.LEND);
      expect(inactiveOrders[0].unitPrice).to.equal('9881');
      expect(inactiveOrders[0].maturity).to.equal(maturities[0]);
      expect(inactiveOrders[0].amount).to.equal('50000000000000001');
    });

    it('Get empty orders', async () => {
      const { activeOrders, inactiveOrders } =
        await lendingMarketControllerProxy.getOrders(
          [targetCurrency],
          alice.address,
        );

      expect(activeOrders.length).to.equal(0);
      expect(inactiveOrders.length).to.equal(0);
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
            lendingMarketControllerProxy.getPresentValue(
              targetCurrency,
              maturities[marketNo],
              alice.address,
            ),
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
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9900',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrderFilled',
      );

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9600',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9500',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrderFilled',
      );

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '8900',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[2],
            Side.BORROW,
            '80000000000000000',
            '0',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketControllerProxy.address),
        'OrderFilled',
      );

      await checkPresentValue();
    });

    describe('Limit Order', async () => {
      it('Fill all lending orders at one rate', async () => {
        const lendingMarket1 = lendingMarketProxies[0];

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8800',
          );

        await expect(tx).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
        await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');
        await expect(tx).to.not.emit(lendingMarket1, 'OrderMade');
      });

      it('Fill all borrowing orders at one rate', async () => {
        const lendingMarket1 = lendingMarketProxies[0];

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8800',
          );

        await expect(tx).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
        await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');
        await expect(tx).to.not.emit(lendingMarket1, 'OrderMade');
      });

      it('Fill orders partially at one rate', async () => {
        const lendingMarket1 = lendingMarketProxies[0];

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(dave)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(ellen)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8800',
          );

        await expect(tx).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
        await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');
        await expect(tx)
          .to.not.emit(lendingMarket1, 'OrderMade')
          .withArgs(
            4,
            0,
            bob.address,
            Side.LEND,
            targetCurrency,
            maturities[0],
            '100000000000000000',
            '8800',
          );
      });

      it('Fill orders at one rate with a partial amount with limit rate', async () => {
        const lendingMarket1 = lendingMarketProxies[0];
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8000',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '80000000000000000',
            '8000',
          );
        await expect(tx).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
        await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');
        await expect(tx)
          .to.emit(lendingMarket1, 'OrderPartiallyTaken')
          .withArgs(
            () => true,
            bob.address,
            Side.LEND,
            targetCurrency,
            maturities[0],
            '30000000000000000',
            '37500000000000000',
          );
      });

      it('Fill orders at one rate with a over amount with limit rate', async () => {
        const lendingMarket1 = lendingMarketProxies[0];
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '120000000000000000',
            '8800',
          );
        await expect(tx).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
        await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');
        await expect(tx).to.emit(lendingMarket1, 'OrderMade');
      });

      it('Fill an own order', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '8798',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8801',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill an order partially out of the orders held', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '50000000000000000',
              '8798',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );
      });

      it('Fill multiple orders partially out of the orders held', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8800',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8799',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8798',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '8797',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8800',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8799',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '8798',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
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
            .createOrder(
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
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              totalAmount.toString(),
              '9880',
            ),
        )
          .to.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          )
          .withArgs(
            users[0].address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            totalAmount,
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
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              orderAmount,
              String(9880 - i),
            );
        }

        await expect(
          lendingMarketControllerProxy
            .connect(users[0])
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              totalAmount.toString(),
              '9880',
            ),
        )
          .to.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          )
          .withArgs(
            users[0].address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            totalAmount,
            () => true, // any value
          );
      });
    });

    describe('Market Order', async () => {
      it('Fail to place a borrow market order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '0',
            ),
        ).to.be.revertedWith('Order not found');
      });

      it('Fail to place a lend market order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .depositAndCreateOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '0',
              { value: '1000000000000000' },
            ),
        ).to.be.revertedWith('Order not found');
      });
    });

    describe('Unwind', async () => {
      it('Unwind a lending order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '20000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '20000000000000000',
              '8000',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        )
          .to.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          )
          .withArgs(
            alice.address,
            targetCurrency,
            Side.BORROW,
            maturities[0],
            '10000000000000000',
            '12500000000000000',
          );

        const aliveFV = await lendingMarketControllerProxy.getFutureValue(
          targetCurrency,
          maturities[0],
          alice.address,
        );

        expect(aliveFV).to.equal('0');
      });

      it('Unwind a borrowing order', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '20000000000000000',
              '8200',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '5000000000000000',
              '8000',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '5000000000000000',
              '8000',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        )
          .to.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          )
          .withArgs(
            alice.address,
            targetCurrency,
            Side.LEND,
            maturities[0],
            '10250000000000000',
            '12500000000000000',
          );

        const aliveFV = await lendingMarketControllerProxy.getFutureValue(
          targetCurrency,
          maturities[0],
          alice.address,
        );

        expect(aliveFV).to.equal('0');
      });

      it("Unwind a order at the order book that don't has enough orders", async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '20000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '9000000000000000',
              '8000',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        )
          .to.emit(
            fundManagementLogic.attach(lendingMarketControllerProxy.address),
            'OrderFilled',
          )
          .withArgs(
            alice.address,
            targetCurrency,
            Side.BORROW,
            maturities[0],
            '9000000000000000',
            '11250000000000000',
          );

        const aliveFV = await lendingMarketControllerProxy.getFutureValue(
          targetCurrency,
          maturities[0],
          alice.address,
        );

        expect(aliveFV).to.equal('1250000000000000');
      });

      it("Unwind a order ta the order book that don't has any orders", async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '10000000000000000',
              '8000',
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '10000000000000000',
              '8000',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        const aliveFV = await lendingMarketControllerProxy.getFutureValue(
          targetCurrency,
          maturities[0],
          alice.address,
        );

        expect(aliveFV).to.equal('-12500000000000000');
      });

      it('Fail to execute unwinding due to no future values user has', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, maturities[0]),
        ).to.be.revertedWith('Future Value is zero');
      });

      it('Fail to execute unwinding due to invalid maturity', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .unwindPosition(targetCurrency, '1'),
        ).to.be.revertedWith('Invalid maturity');
      });
    });

    describe('Failure', async () => {
      it('Fail to create an order due to insufficient collateral', async () => {
        await mockTokenVault.mock.isCovered.returns(false);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '8000',
            ),
        ).not.to.be.revertedWith(
          'Not enough collateral in the selected currency',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '8000',
            ),
        ).to.be.revertedWith('Not enough collateral');
      });

      it('Fail to rotate lending markets due to pre-maturity', async () => {
        await expect(
          lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
        ).to.be.revertedWith('Market is not matured');
      });

      it('Fail to cancel an order due to invalid order', async () => {
        const lendingMarket1 = lendingMarketProxies[0];

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .cancelOrder(targetCurrency, maturities[0], '10'),
        ).to.be.revertedWith('Order not found');
      });
    });

    describe('Liquidations', async () => {
      beforeEach(async () => {
        // Set up for the mocks
        await mockTokenVault.mock.getLiquidationAmount.returns(1000, 20, 10);
        await mockTokenVault.mock.getDepositAmount.returns(100);
        await mockTokenVault.mock.transferFrom.returns(0);
        await mockTokenVault.mock['isCovered(address)'].returns(true);
        await mockReserveFund.mock.isPaused.returns(true);
        await mockCurrencyController.mock.convert.returns(100);
        await mockCurrencyController.mock.convertFromBaseCurrency.returns(1);
      });

      it("Liquidate less than 50% lending position in case the one position doesn't cover liquidation amount", async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');

        await lendingMarketControllerProxy
          .connect(signers[0])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            orderRate,
          );

        await lendingMarketControllerProxy
          .connect(signers[1])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '8001',
          );

        await lendingMarketControllerProxy
          .connect(signers[2])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '8000',
          )
          .then((tx) =>
            expect(tx).to.emit(
              fundManagementLogic.attach(lendingMarketControllerProxy.address),
              'OrderFilled',
            ),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'LiquidationExecuted')
              .withArgs(
                signers[0].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                100,
              ),
          );
      });

      it('Liquidate 50% lending position in case the one position cover liquidation amount', async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');

        await lendingMarketControllerProxy
          .connect(signers[3])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            orderRate,
          );

        await lendingMarketControllerProxy
          .connect(signers[4])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '8001',
          );

        await lendingMarketControllerProxy
          .connect(signers[5])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '8000',
          )
          .then((tx) =>
            expect(tx).to.emit(
              fundManagementLogic.attach(lendingMarketControllerProxy.address),
              'OrderFilled',
            ),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[3].address,
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'LiquidationExecuted')
              .withArgs(
                signers[3].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                100,
              ),
          );
      });

      it('Liquidate lending position using zero-coupon bonds', async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');

        // Set up for the mocks
        await mockTokenVault.mock.transferFrom.returns(100);

        await lendingMarketControllerProxy
          .connect(signers[0])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            orderRate,
          );

        await lendingMarketControllerProxy
          .connect(signers[1])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '8001',
          );

        await lendingMarketControllerProxy
          .connect(signers[2])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '8000',
          )
          .then((tx) =>
            expect(tx).to.emit(
              fundManagementLogic.attach(lendingMarketControllerProxy.address),
              'OrderFilled',
            ),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'LiquidationExecuted')
              .withArgs(
                signers[0].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                100,
              ),
          );
      });

      it('Fail to liquidate a lending position due to no debt', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeLiquidationCall(
              targetCurrency,
              targetCurrency,
              maturities[0],
              signers[0].address,
            ),
        ).to.be.revertedWith('No debt in the selected maturity');
      });

      it('Fail to liquidate a lending position due to no liquidation amount', async () => {
        // Set up for the mocks
        await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);

        await lendingMarketControllerProxy
          .connect(signers[6])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(signers[7])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000',
            '8000',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeLiquidationCall(
              targetCurrency,
              targetCurrency,
              maturities[0],
              signers[6].address,
            ),
        ).to.be.revertedWith('User has enough collateral');
      });

      it('Fail to liquidate a lending position due to insufficient collateral', async () => {
        // Set up for the mocks
        await mockTokenVault.mock['isCovered(address)'].returns(false);

        await lendingMarketControllerProxy
          .connect(signers[6])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(signers[7])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000',
            '8000',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeLiquidationCall(
              targetCurrency,
              targetCurrency,
              maturities[0],
              signers[6].address,
            ),
        ).to.be.revertedWith('Invalid liquidation');
      });
    });
  });
});
