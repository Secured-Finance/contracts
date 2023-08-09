import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../../utils/constants';
import { CIRCUIT_BREAKER_LIMIT_RANGE } from '../common/constants';
import { calculateFutureValue } from '../common/orders';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const LendingMarketCaller = artifacts.require('LendingMarketCaller');

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');

const { deployContract } = waffle;

describe('LendingMarket', () => {
  let beaconProxyControllerProxy: Contract;
  let lendingMarketCaller: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: SignerWithAddress[];

  let lendingMarket: Contract;
  let orderActionLogic: Contract;
  let orderBookLogic: Contract;
  let currentOrderBookId: BigNumber;

  const initialize = async (maturity: number, openingDate: number) => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    await lendingMarketCaller.deployLendingMarket(targetCurrency);
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
    );

    lendingMarket = await lendingMarketCaller
      .getLendingMarket(targetCurrency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    orderActionLogic = orderActionLogic.attach(lendingMarket.address);
    orderBookLogic = orderBookLogic.attach(lendingMarket.address);

    currentOrderBookId = await lendingMarketCaller.getOrderBookId(
      targetCurrency,
    );
  };

  before(async () => {
    [owner, alice, bob, carol, ...signers] = await ethers.getSigners();

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const beaconProxyController = await deployContract(
      owner,
      BeaconProxyController,
    );

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const beaconProxyControllerAddress = await proxyController
      .setBeaconProxyControllerImpl(beaconProxyController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    beaconProxyControllerProxy = await ethers.getContractAt(
      'BeaconProxyController',
      beaconProxyControllerAddress,
    );

    // Deploy LendingMarketCaller
    lendingMarketCaller = await deployContract(owner, LendingMarketCaller, [
      beaconProxyControllerProxy.address,
    ]);

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['BeaconProxyController', beaconProxyControllerProxy],
      ['LendingMarketController', lendingMarketCaller],
    ];

    const importAddressesArgs = {
      names: migrationTargets.map(([name]) =>
        ethers.utils.formatBytes32String(name),
      ),
      addresses: migrationTargets.map(([, contract]) => contract.address),
    };

    await addressResolverProxy.importAddresses(
      importAddressesArgs.names,
      importAddressesArgs.addresses,
    );
    await migrationAddressResolver.buildCaches([
      beaconProxyControllerProxy.address,
    ]);

    // Set up for LendingMarketController
    const orderReaderLogic = await deployContract(owner, OrderReaderLogic);

    orderBookLogic = await deployContract(owner, OrderBookLogic);

    orderActionLogic = await ethers
      .getContractFactory('OrderActionLogic', {
        libraries: {
          OrderReaderLogic: orderReaderLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    const lendingMarket = await ethers
      .getContractFactory('LendingMarket', {
        libraries: {
          OrderActionLogic: orderActionLogic.address,
          OrderReaderLogic: orderReaderLogic.address,
          OrderBookLogic: orderBookLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    await beaconProxyControllerProxy.setLendingMarketImpl(
      lendingMarket.address,
    );
  });

  describe('Calculate amounts to be filled', async () => {
    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      await initialize(maturity, timestamp);
    });

    it('Calculate the filled amount from one lending order', async () => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          '8000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      const zeroOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        0,
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(zeroOrderResult.lastUnitPrice).to.equal('0');
      expect(zeroOrderResult.filledAmount).to.equal('0');
      expect(zeroOrderResult.filledAmountInFV).to.equal('0');

      const marketOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '100000000000000',
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(marketOrderResult.lastUnitPrice).to.equal('8000');
      expect(marketOrderResult.filledAmount).to.equal('100000000000000');
      expect(marketOrderResult.filledAmountInFV).to.equal('125000000000000');

      const limitOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '100000000000000',
        '8000',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult.lastUnitPrice).to.equal('8000');
      expect(limitOrderResult.filledAmount).to.equal('100000000000000');
      expect(limitOrderResult.filledAmountInFV).to.equal('125000000000000');
    });

    it('Calculate the filled amount from one borrowing order', async () => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '200000000000000',
          '8000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      const marketOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        '200000000000000',
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      const zeroOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        0,
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(zeroOrderResult.lastUnitPrice).to.equal('0');
      expect(zeroOrderResult.filledAmount).to.equal('0');
      expect(zeroOrderResult.filledAmountInFV).to.equal('0');

      expect(marketOrderResult.lastUnitPrice).to.equal('8000');
      expect(marketOrderResult.filledAmount).to.equal('200000000000000');
      expect(marketOrderResult.filledAmountInFV).to.equal('250000000000000');

      const limitOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        '200000000000000',
        '8000',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult.lastUnitPrice).to.equal('8000');
      expect(limitOrderResult.filledAmount).to.equal('200000000000000');
      expect(limitOrderResult.filledAmountInFV).to.equal('250000000000000');
    });

    it('Calculate the filled amount from multiple lending order', async () => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          '8000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          '7900',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      const marketOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '150000000000000',
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(marketOrderResult.lastUnitPrice).to.equal('7900');
      expect(marketOrderResult.filledAmount).to.equal('150000000000000');
      expect(marketOrderResult.filledAmountInFV).to.equal('188291139240507');

      const limitOrderResult1 = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '150000000000000',
        '8000',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult1.lastUnitPrice).to.equal('8000');
      expect(limitOrderResult1.filledAmount).to.equal('100000000000000');
      expect(limitOrderResult1.filledAmountInFV).to.equal('125000000000000');

      const limitOrderResult2 = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '150000000000000',
        '7900',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult2.lastUnitPrice).to.equal('7900');
      expect(limitOrderResult2.filledAmount).to.equal('150000000000000');
      expect(limitOrderResult2.filledAmountInFV).to.equal('188291139240507');
    });

    it('Calculate the filled amount from multiple borrowing order', async () => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '200000000000000',
          '8000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '100000000000000',
          '8100',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      const marketOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        '250000000000000',
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(marketOrderResult.lastUnitPrice).to.equal('8100');
      expect(marketOrderResult.filledAmount).to.equal('250000000000000');
      expect(marketOrderResult.filledAmountInFV).to.equal('311728395061729');

      const limitOrderResult1 = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        '250000000000000',
        '8000',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult1.lastUnitPrice).to.equal('8000');
      expect(limitOrderResult1.filledAmount).to.equal('200000000000000');
      expect(limitOrderResult1.filledAmountInFV).to.equal('250000000000000');

      const limitOrderResult2 = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.LEND,
        '250000000000000',
        '8100',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult2.lastUnitPrice).to.equal('8100');
      expect(limitOrderResult2.filledAmount).to.equal('250000000000000');
      expect(limitOrderResult2.filledAmountInFV).to.equal('311728395061729');
    });

    it('Calculate the blocked order amount by the circuit breaker', async () => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          '8000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          '7000',
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      const marketOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '200000000000000',
        0,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(marketOrderResult.lastUnitPrice).to.equal('8000');
      expect(marketOrderResult.filledAmount).to.equal('100000000000000');
      expect(marketOrderResult.filledAmountInFV).to.equal('125000000000000');

      const limitOrderResult = await lendingMarket.calculateFilledAmount(
        currentOrderBookId,
        Side.BORROW,
        '200000000000000',
        '7000',
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(limitOrderResult.lastUnitPrice).to.equal('8000');
      expect(limitOrderResult.filledAmount).to.equal('100000000000000');
      expect(limitOrderResult.filledAmountInFV).to.equal('125000000000000');
    });
  });

  describe('Pre-Order', async () => {
    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();
      const openingDate = moment(timestamp * 1000)
        .add(48, 'h')
        .unix();

      await initialize(maturity, openingDate);
    });

    it('Fail to crete a lending pre-order due to opposite order existing', async () => {
      await lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '1000000000000000',
          '8000',
        );

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '1000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Opposite side order exists');
    });

    it('Fail to crete a borrowing pre-order due to opposite order existing', async () => {
      await lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '1000000000000000',
          '8000',
        );

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '1000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Opposite side order exists');
    });
  });

  describe('Itayose', async () => {
    let maturity: number;

    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000)
        .add(48, 'h')
        .unix();

      await initialize(maturity, openingDate);
    });

    const tests = [
      {
        openingPrice: '8300',
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: true,
        lastLendUnitPrice: 8300,
        lastBorrowUnitPrice: 8000,
      },
      {
        openingPrice: '8000',
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: true,
        lastLendUnitPrice: 8300,
        lastBorrowUnitPrice: 8000,
      },
      {
        openingPrice: '8150',
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: true,
        lastLendUnitPrice: 8300,
        lastBorrowUnitPrice: 8000,
      },
      {
        openingPrice: '9000',
        orders: [
          { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
          { side: Side.BORROW, unitPrice: '8500', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '9000', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: true,
        lastLendUnitPrice: 9000,
        lastBorrowUnitPrice: 8500,
      },
      {
        openingPrice: '8200',
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8100', amount: '100000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '50000000000000' },
          { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '8200', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: true,
        lastLendUnitPrice: 8200,
        lastBorrowUnitPrice: 8100,
      },
      {
        openingPrice: '4000', // 0 + 8,000 = 4,000 / 2
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8100', amount: '100000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '50000000000000' },
        ],
        shouldItayoseExecuted: false,
        lastLendUnitPrice: 0,
        lastBorrowUnitPrice: 0,
      },
      {
        openingPrice: '9150', // 10,000 + 8,300 = 9,150 / 2
        orders: [
          { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '8200', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: false,
        lastLendUnitPrice: 0,
        lastBorrowUnitPrice: 0,
      },
      {
        openingPrice: '8150', // 7,800 + 8,500 / 2
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: false,
        lastLendUnitPrice: 0,
        lastBorrowUnitPrice: 0,
      },
    ];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];

      it(`Execute Itayose call(Case ${i + 1})`, async () => {
        const borrower = signers[2 * i];
        const lender = signers[2 * i + 1];

        for (const order of test.orders) {
          const user = order.side === Side.BORROW ? borrower : lender;

          await expect(
            lendingMarketCaller
              .connect(user)
              .executePreOrder(
                targetCurrency,
                currentOrderBookId,
                order.side,
                order.amount,
                order.unitPrice,
              ),
          )
            .to.emit(orderActionLogic, 'PreOrderExecuted')
            .withArgs(
              user.address,
              order.side,
              targetCurrency,
              maturity,
              order.amount,
              order.unitPrice,
              () => true,
            );
        }

        // Increase 47 hours
        await time.increase(169200);

        await lendingMarketCaller
          .executeItayoseCall(targetCurrency, currentOrderBookId)
          .then(async (tx) => {
            if (test.shouldItayoseExecuted) {
              await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
            } else {
              await expect(tx).not.to.emit(orderBookLogic, 'ItayoseExecuted');
            }
          });

        const { openingUnitPrice } = await lendingMarket.getItayoseLog(
          maturity,
        );

        expect(openingUnitPrice).to.equal(test.openingPrice);

        const itayoseLog = await lendingMarket.getItayoseLog(maturity);

        expect(itayoseLog.lastLendUnitPrice).to.equal(test.lastLendUnitPrice);
        expect(itayoseLog.lastBorrowUnitPrice).to.equal(
          test.lastBorrowUnitPrice,
        );
      });
    }

    it('Execute Itayose call without pre-orders', async () => {
      // Increase 47 hours
      await time.increase(169200);

      await expect(
        lendingMarketCaller.executeItayoseCall(
          targetCurrency,
          currentOrderBookId,
        ),
      ).to.not.emit(orderBookLogic, 'ItayoseExecuted');
    });

    it('Fail to create a pre-order due to an existing order with a past maturity', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(2, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000)
        .add(48, 'h')
        .unix();

      await lendingMarketCaller.createOrderBook(
        targetCurrency,
        maturity,
        openingDate,
      );

      await lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '100000000000000000',
          '8000',
        );
      await lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      // Increase 48 hours
      await time.increase(172800);

      await lendingMarketCaller
        .executeItayoseCall(targetCurrency, currentOrderBookId)
        .then(async (tx) => {
          await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
        });

      // Move to 48 hours before maturity of 2nd order book.
      await time.increaseTo(maturity - 172800);

      const { timestamp: newTimestamp } = await ethers.provider.getBlock(
        'latest',
      );
      const newMaturity = moment(newTimestamp * 1000)
        .add(1, 'M')
        .unix();
      const newOpeningDate = moment(newTimestamp * 1000)
        .add(48, 'h')
        .unix();

      await lendingMarketCaller.reopenOrderBook(
        targetCurrency,
        currentOrderBookId,
        newMaturity,
        newOpeningDate,
      );

      await expect(
        lendingMarketCaller
          .connect(alice)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Order found in past maturity');

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Order found in past maturity');
    });

    it('Fail to create a pre-order due to not in the pre-order period', async () => {
      time.increaseTo(maturity);

      await expect(
        lendingMarketCaller
          .connect(alice)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000000',
            '8720',
          ),
      ).to.be.revertedWith('Not in the pre-order period');
    });

    it('Fail to execute the Itayose call due to not in the Itayose period', async () => {
      await expect(
        lendingMarketCaller.executeItayoseCall(
          targetCurrency,
          currentOrderBookId,
        ),
      ).to.be.revertedWith('Not in the Itayose period');
    });
  });

  describe('Circuit Breaker', async () => {
    const CIRCUIT_BREAKER_BORROW_THRESHOLD = 8374;
    const CIRCUIT_BREAKER_LEND_THRESHOLD = 8629;
    const MAX_DIFFERENCE = 200;
    const MIN_DIFFERENCE = 10;
    let maturity: number;

    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000).unix();

      await initialize(maturity, openingDate);
    });

    const createInitialOrders = async (
      side: number,
      unitPrice: number,
    ): Promise<number> => {
      const offsetUnitPrice =
        side === Side.LEND
          ? CIRCUIT_BREAKER_BORROW_THRESHOLD - 1
          : CIRCUIT_BREAKER_LEND_THRESHOLD + 1;

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          side,
          '100000000000000',
          unitPrice,
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          side,
          '100000000000000',
          offsetUnitPrice,
          CIRCUIT_BREAKER_LIMIT_RANGE,
        );

      return offsetUnitPrice;
    };

    describe('Get circuit breaker thresholds', async () => {
      it('Get circuit breaker thresholds on the empty order book', async () => {
        const { maxLendUnitPrice, minBorrowUnitPrice } =
          await lendingMarket.getCircuitBreakerThresholds(
            currentOrderBookId,
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        expect(maxLendUnitPrice).to.equal('10000');
        expect(minBorrowUnitPrice).to.equal('1');
      });

      it('Get circuit breaker thresholds on the non-empty order book', async () => {
        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '100000000000000',
            '5000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000',
            '9950',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        const { maxLendUnitPrice, minBorrowUnitPrice } =
          await lendingMarket.getCircuitBreakerThresholds(
            currentOrderBookId,
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        expect(maxLendUnitPrice).to.equal('9960');
        expect(minBorrowUnitPrice).to.equal('4800');
      });
    });

    for (const side of [Side.BORROW, Side.LEND]) {
      const title = side === Side.BORROW ? 'Borrow orders' : 'Lend orders';

      describe(title, async () => {
        const isBorrow = side == Side.BORROW;

        for (const orderType of ['market', 'limit']) {
          it(`Fill an order partially until the circuit breaker threshold using the ${orderType} order`, async () => {
            await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

            const unitPrice =
              orderType === 'market' ? 0 : 8500 + (isBorrow ? -500 : 500);
            await expect(
              lendingMarketCaller
                .connect(bob)
                .executeOrder(
                  targetCurrency,
                  currentOrderBookId,
                  side,
                  '200000000000000',
                  unitPrice,
                  CIRCUIT_BREAKER_LIMIT_RANGE,
                ),
            )
              .to.emit(orderActionLogic, 'OrderExecuted')
              .withArgs(
                bob.address,
                side,
                targetCurrency,
                maturity,
                '200000000000000',
                unitPrice,
                '100000000000000',
                '8500',
                () => true,
                0,
                0,
                0,
                true,
              );
          });
        }

        it('Execute multiple transactions to fill orders in one block with the circuit breaker triggered', async () => {
          await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '150000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              '50000000000000',
              '8500',
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '150000000000000',
              '0',
              '50000000000000',
              '8500',
              () => true,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fill an order in different blocks after the circuit breaker has been triggered', async () => {
          const offsetUnitPrice = await createInitialOrders(
            isBorrow ? Side.LEND : Side.BORROW,
            8500,
          );

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              '8500',
              () => true,
              0,
              0,
              0,
              false,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);

          await expect(
            lendingMarketCaller
              .connect(carol)
              .executeOrder(
                targetCurrency,
                currentOrderBookId,
                side,
                '50000000000000',
                '0',
                CIRCUIT_BREAKER_LIMIT_RANGE,
              ),
          )
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              '50000000000000',
              offsetUnitPrice,
              () => true,
              0,
              0,
              0,
              false,
            );
        });

        it('Fill an order in the same block after the circuit breaker has been triggered', async () => {
          const oppositeOrderSide = isBorrow ? Side.LEND : Side.BORROW;
          const lendingOrderAmount = 8500 + (isBorrow ? 500 : -500);
          await createInitialOrders(oppositeOrderSide, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx1 = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              oppositeOrderSide,
              '100000000000000',
              lendingOrderAmount,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx2 = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(carolTx1)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await expect(carolTx2)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              '50000000000000',
              lendingOrderAmount,
              () => true,
              0,
              0,
              0,
              false,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fail to place a second market order in the same block due to no filled amount', async () => {
          await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              8500,
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              '0',
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fail to place a second limit order in the same block due to over the circuit breaker threshold', async () => {
          const offsetUnitPrice = await createInitialOrders(
            isBorrow ? Side.LEND : Side.BORROW,
            8500,
          );

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              8500,
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              offsetUnitPrice,
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Maximum difference between threshold and unitPrice can be max_difference', async () => {
          const unitPrice = 5000;
          const offsetUnitPrice =
            side === Side.LEND
              ? unitPrice + MAX_DIFFERENCE + 1
              : unitPrice - MAX_DIFFERENCE - 1;

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              unitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              unitPrice,
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              offsetUnitPrice,
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Minimum difference between threshold and unitPrice should be min_difference', async () => {
          const unitPrice = 9950;
          const offsetUnitPrice =
            side === Side.LEND
              ? unitPrice + MIN_DIFFERENCE + 1
              : unitPrice - MIN_DIFFERENCE - 1;

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              unitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              unitPrice,
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(carolTx)
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              offsetUnitPrice,
              0,
              0,
              0,
              0,
              0,
              0,
              true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fail to place an order with circuit breaker range more than equal to 10000', async () => {
          const unitPrice = 8000;

          await expect(
            lendingMarketCaller
              .connect(alice)
              .executeOrder(
                targetCurrency,
                currentOrderBookId,
                side,
                '100000000000000',
                unitPrice,
                10000,
              ),
          ).to.revertedWith('CB limit can not be so high');
        });

        it('Threshold should not cross the range', async () => {
          const unitPrice = isBorrow ? 9 : 9991;
          const unitPrice2 = isBorrow ? 4 : 9996;

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              unitPrice,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await lendingMarketCaller
            .connect(alice)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              isBorrow ? Side.LEND : Side.BORROW,
              '100000000000000',
              unitPrice2,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            );

          await expect(
            lendingMarketCaller
              .connect(bob)
              .executeOrder(
                targetCurrency,
                currentOrderBookId,
                side,
                '100000000000000',
                '0',
                CIRCUIT_BREAKER_LIMIT_RANGE,
              ),
          )
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              '0',
              '100000000000000',
              unitPrice,
              () => true,
              0,
              0,
              0,
              false,
            );

          await expect(
            lendingMarketCaller
              .connect(bob)
              .executeOrder(
                targetCurrency,
                currentOrderBookId,
                side,
                '100000000000000',
                isBorrow ? 1 : 10000,
                CIRCUIT_BREAKER_LIMIT_RANGE,
              ),
          )
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              isBorrow ? 1 : 10000,
              '100000000000000',
              unitPrice2,
              () => true,
              0,
              0,
              0,
              false,
            );
        });
      });
    }

    describe('Clean up orders', async () => {
      it('Clean up a lending order', async () => {
        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '100000000000000',
            '8000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000',
            '8000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await expect(
          lendingMarketCaller.cleanUpOrders(
            targetCurrency,
            currentOrderBookId,
            alice.address,
          ),
        )
          .to.emit(orderActionLogic, 'OrdersCleaned')
          .withArgs(
            [1],
            alice.address,
            Side.LEND,
            targetCurrency,
            maturity,
            '100000000000000',
            '125000000000000',
          );
      });

      it('Clean up a borrowing order', async () => {
        await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000',
            '8000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '100000000000000',
            '8000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await expect(
          lendingMarketCaller.cleanUpOrders(
            targetCurrency,
            currentOrderBookId,
            bob.address,
          ),
        )
          .to.emit(orderActionLogic, 'OrdersCleaned')
          .withArgs(
            [1],
            bob.address,
            Side.BORROW,
            targetCurrency,
            maturity,
            '100000000000000',
            '125000000000000',
          );
      });
    });

    describe('Unwind positions', async () => {
      it('Unwind a position partially until the circuit breaker threshold', async () => {
        await createInitialOrders(Side.LEND, 8000);

        await expect(
          lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              Side.BORROW,
              '100000000000000',
              0,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            ),
        ).to.emit(orderActionLogic, 'OrderExecuted');

        await createInitialOrders(Side.BORROW, 8500);

        await expect(
          lendingMarketCaller
            .connect(bob)
            .unwindPosition(
              targetCurrency,
              currentOrderBookId,
              Side.LEND,
              '125000000000000',
              CIRCUIT_BREAKER_LIMIT_RANGE,
            ),
        )
          .to.emit(orderActionLogic, 'PositionUnwound')
          .withArgs(
            bob.address,
            Side.LEND,
            targetCurrency,
            maturity,
            calculateFutureValue('100000000000000', 8000),
            '100000000000000',
            '8500',
            calculateFutureValue('100000000000000', 8500),
            true,
          );
      });

      it('Unwind no position due to circuit breaker', async () => {
        await createInitialOrders(Side.LEND, 8000);

        await expect(
          lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              Side.BORROW,
              '100000000000000',
              0,
              CIRCUIT_BREAKER_LIMIT_RANGE,
            ),
        ).to.emit(orderActionLogic, 'OrderExecuted');

        await createInitialOrders(Side.BORROW, 8500);

        await ethers.provider.send('evm_setAutomine', [false]);

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '100000000000000',
            0,
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        const tx = await lendingMarketCaller
          .connect(bob)
          .unwindPosition(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '125000000000000',
            CIRCUIT_BREAKER_LIMIT_RANGE,
          );

        await ethers.provider.send('evm_mine', []);

        await expect(tx)
          .to.emit(orderActionLogic, 'PositionUnwound')
          .withArgs(
            bob.address,
            Side.LEND,
            targetCurrency,
            maturity,
            calculateFutureValue('100000000000000', 8000),
            0,
            0,
            0,
            true,
          );

        await ethers.provider.send('evm_setAutomine', [true]);
      });
    });
  });
});
