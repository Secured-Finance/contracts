import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../../utils/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const LendingMarketCaller = artifacts.require('LendingMarketCaller');

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');

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

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;
  });

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
    const orderBookLogic = await deployContract(owner, OrderBookLogic);
    const lendingMarket = await ethers
      .getContractFactory('LendingMarket', {
        libraries: {
          OrderBookLogic: orderBookLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    await beaconProxyControllerProxy.setLendingMarketImpl(
      lendingMarket.address,
    );
  });

  describe('Itayose', async () => {
    let lendingMarket: Contract;
    let currentMarketIdx: number;

    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000)
        .add(48, 'h')
        .unix();

      await lendingMarketCaller.deployLendingMarket(
        targetCurrency,
        maturity,
        openingDate,
      );

      lendingMarket = await lendingMarketCaller
        .getLendingMarkets()
        .then((addresses) => {
          currentMarketIdx = addresses.length - 1;
          return ethers.getContractAt(
            'LendingMarket',
            addresses[currentMarketIdx],
          );
        });
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
      },
      {
        openingPrice: '4000', // 0 + 8,000 = 4,000 / 2
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.BORROW, unitPrice: '8100', amount: '100000000000000' },
          { side: Side.BORROW, unitPrice: '8000', amount: '50000000000000' },
        ],
        shouldItayoseExecuted: false,
      },
      {
        openingPrice: '9150', // 10,000 + 8,300 = 9,150 / 2
        orders: [
          { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
          { side: Side.LEND, unitPrice: '8200', amount: '200000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: false,
      },
      {
        openingPrice: '8150', // 7,800 + 8,500 / 2
        orders: [
          { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
          { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
        ],
        shouldItayoseExecuted: false,
      },
    ];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];

      it(`Execute Itayose call(Case ${i + 1})`, async () => {
        for (const order of test.orders) {
          await expect(
            lendingMarketCaller
              .connect(alice)
              .createPreOrder(
                order.side,
                order.amount,
                order.unitPrice,
                currentMarketIdx,
              ),
          ).to.emit(lendingMarket, 'OrderMade');
        }

        // Increase 47 hours
        await time.increase(169200);

        await lendingMarketCaller
          .executeItayoseCall(currentMarketIdx)
          .then(async (tx) => {
            if (test.shouldItayoseExecuted) {
              await expect(tx).to.emit(lendingMarket, 'ItayoseExecuted');
            } else {
              await expect(tx).not.to.emit(lendingMarket, 'ItayoseExecuted');
            }
          });

        const openingPrice = await lendingMarket.getOpeningUnitPrice();

        expect(openingPrice).to.equal(test.openingPrice);
      });
    }

    it('Execute Itayose call without pre-orders', async () => {
      // Increase 47 hours
      await time.increase(169200);

      await expect(
        lendingMarketCaller.executeItayoseCall(currentMarketIdx),
      ).to.not.emit(lendingMarket, 'ItayoseExecuted');
    });

    it('Fail to create a pre-order due to not in the pre-order period', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(1, 'm')
        .unix();
      const openingDate = moment(timestamp * 1000)
        .add(49, 'h')
        .unix();

      await lendingMarketCaller.deployLendingMarket(
        targetCurrency,
        maturity,
        openingDate,
      );

      await expect(
        lendingMarketCaller
          .connect(alice)
          .createPreOrder(Side.BORROW, '100000000000000000', '8720', 0),
      ).to.be.revertedWith('Not in the pre-order period');
    });

    it('Fail to execute the Itayose call due to not in the Itayose period ', async () => {
      await expect(
        lendingMarketCaller.executeItayoseCall(currentMarketIdx),
      ).to.be.revertedWith('Not in the Itayose period');
    });
  });

  describe('Circuit Breaker', async () => {
    const CIRCUIT_BREAKER_RATE_RANGE = 1000;
    const CIRCUIT_BREAKER_BORROW_THRESHOLD = 8374;
    const CIRCUIT_BREAKER_LEND_THRESHOLD = 8629;
    const MAX_DIFFERENCE = 200;
    const MIN_DIFFERENCE = 10;
    let lendingMarket: Contract;
    let currentMarketIdx: number;
    let maturity: number;

    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000).unix();

      await lendingMarketCaller.deployLendingMarket(
        targetCurrency,
        maturity,
        openingDate,
      );

      lendingMarket = await lendingMarketCaller
        .getLendingMarkets()
        .then((addresses) => {
          currentMarketIdx = addresses.length - 1;
          return ethers.getContractAt(
            'LendingMarket',
            addresses[currentMarketIdx],
          );
        });
    });

    const createInitialOrders = async (
      side: number,
      unitPrice: number,
    ): Promise<number> => {
      const offsetUnitPrice =
        side === Side.LEND
          ? CIRCUIT_BREAKER_BORROW_THRESHOLD - 1
          : CIRCUIT_BREAKER_LEND_THRESHOLD + 1;

      await expect(
        lendingMarketCaller
          .connect(alice)
          .createOrder(
            side,
            '100000000000000',
            unitPrice,
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      ).to.emit(lendingMarket, 'OrderMade');

      await expect(
        lendingMarketCaller
          .connect(alice)
          .createOrder(
            side,
            '100000000000000',
            offsetUnitPrice,
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      ).to.emit(lendingMarket, 'OrderMade');

      return offsetUnitPrice;
    };

    for (const side of [Side.BORROW, Side.LEND]) {
      const title = side === Side.BORROW ? 'Borrow Orders' : 'Lend Orders';

      describe(title, async () => {
        const isBorrow = side == Side.BORROW;

        for (const orderType of ['market', 'limit']) {
          it(`Fill an order partially until the circuit breaker threshold using the ${orderType} order`, async () => {
            await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

            await expect(
              lendingMarketCaller
                .connect(bob)
                .createOrder(
                  side,
                  '200000000000000',
                  orderType === 'market' ? 0 : 8500 + (isBorrow ? -500 : 500),
                  CIRCUIT_BREAKER_RATE_RANGE,
                  currentMarketIdx,
                ),
            )
              .to.emit(lendingMarket, 'OrdersTaken')
              .withArgs(
                bob.address,
                side,
                targetCurrency,
                maturity,
                '100000000000000',
                8500,
                () => true,
              );
          });
        }

        it('Execute multiple transactions to fill orders in one block with the circuit breaker triggered', async () => {
          await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .createOrder(
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '150000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              8500,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              8500,
              () => true,
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
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              8500,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              side === Side.LEND
                ? CIRCUIT_BREAKER_LEND_THRESHOLD
                : CIRCUIT_BREAKER_BORROW_THRESHOLD,
            );

          await ethers.provider.send('evm_setAutomine', [true]);

          await expect(
            lendingMarketCaller
              .connect(carol)
              .createOrder(
                side,
                '50000000000000',
                '0',
                CIRCUIT_BREAKER_RATE_RANGE,
                currentMarketIdx,
              ),
          )
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              offsetUnitPrice,
              () => true,
            );
        });

        it('Fill an order in the same block after the circuit breaker has been triggered', async () => {
          const oppositeOrderSide = isBorrow ? Side.LEND : Side.BORROW;
          const lendingOrderAmount = 8500 + (isBorrow ? 500 : -500);
          await createInitialOrders(oppositeOrderSide, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          await lendingMarketCaller
            .connect(bob)
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx1 = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await lendingMarketCaller
            .connect(alice)
            .createOrder(
              oppositeOrderSide,
              '100000000000000',
              lendingOrderAmount,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx2 = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              0,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(carolTx1)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              side === Side.LEND
                ? CIRCUIT_BREAKER_LEND_THRESHOLD
                : CIRCUIT_BREAKER_BORROW_THRESHOLD,
            );

          await expect(carolTx2)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              carol.address,
              side,
              targetCurrency,
              maturity,
              '50000000000000',
              lendingOrderAmount,
              () => true,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fail to place a second market order in the same block due to no filled amount', async () => {
          await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              8500,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              side === Side.LEND
                ? CIRCUIT_BREAKER_LEND_THRESHOLD
                : CIRCUIT_BREAKER_BORROW_THRESHOLD,
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
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              8500,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              side === Side.LEND
                ? CIRCUIT_BREAKER_LEND_THRESHOLD
                : CIRCUIT_BREAKER_BORROW_THRESHOLD,
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Maximum difference between threshold and unitPrice can be max_difference', async () => {
          const unitPrice = 5000;
          const offsetUnitPrice =
            side === Side.LEND
              ? unitPrice + MAX_DIFFERENCE + 1
              : unitPrice - MAX_DIFFERENCE - 1;

          await expect(
            lendingMarketCaller
              .connect(alice)
              .createOrder(
                isBorrow ? Side.LEND : Side.BORROW,
                '100000000000000',
                unitPrice,
                CIRCUIT_BREAKER_RATE_RANGE,
                currentMarketIdx,
              ),
          ).to.emit(lendingMarket, 'OrderMade');

          await expect(
            lendingMarketCaller
              .connect(alice)
              .createOrder(
                isBorrow ? Side.LEND : Side.BORROW,
                '100000000000000',
                offsetUnitPrice,
                CIRCUIT_BREAKER_RATE_RANGE,
                currentMarketIdx,
              ),
          ).to.emit(lendingMarket, 'OrderMade');

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              unitPrice,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              unitPrice +
                (side === Side.LEND ? MAX_DIFFERENCE : -MAX_DIFFERENCE),
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Minimum difference between threshold and unitPrice should be min_difference', async () => {
          const unitPrice = 9950;
          const offsetUnitPrice =
            side === Side.LEND
              ? unitPrice + MIN_DIFFERENCE + 1
              : unitPrice - MIN_DIFFERENCE - 1;

          await expect(
            lendingMarketCaller
              .connect(alice)
              .createOrder(
                isBorrow ? Side.LEND : Side.BORROW,
                '100000000000000',
                unitPrice,
                CIRCUIT_BREAKER_RATE_RANGE,
                currentMarketIdx,
              ),
          ).to.emit(lendingMarket, 'OrderMade');

          await expect(
            lendingMarketCaller
              .connect(alice)
              .createOrder(
                isBorrow ? Side.LEND : Side.BORROW,
                '100000000000000',
                offsetUnitPrice,
                CIRCUIT_BREAKER_RATE_RANGE,
                currentMarketIdx,
              ),
          ).to.emit(lendingMarket, 'OrderMade');

          await ethers.provider.send('evm_setAutomine', [false]);

          const bobTx = await lendingMarketCaller
            .connect(bob)
            .createOrder(
              side,
              '100000000000000',
              '0',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          const carolTx = await lendingMarketCaller
            .connect(carol)
            .createOrder(
              side,
              '50000000000000',
              offsetUnitPrice,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            );

          await ethers.provider.send('evm_mine', []);

          await expect(bobTx)
            .to.emit(lendingMarket, 'OrdersTaken')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '100000000000000',
              unitPrice,
              () => true,
            );

          await expect(carolTx)
            .to.emit(lendingMarket, 'OrderBlockedByCircuitBreaker')
            .withArgs(
              carol.address,
              targetCurrency,
              side,
              maturity,
              unitPrice +
                (side === Side.LEND ? MIN_DIFFERENCE : -MIN_DIFFERENCE),
            );

          await ethers.provider.send('evm_setAutomine', [true]);
        });

        it('Fail to place an order with circuit breaker range more than equal to 10000', async () => {
          const unitPrice = 8000;

          await expect(
            lendingMarketCaller
              .connect(alice)
              .createOrder(
                side,
                '100000000000000',
                unitPrice,
                10000,
                currentMarketIdx,
              ),
          ).to.revertedWith('CB limit can not be so high');
        });
      });
    }

    it('Threshold should be 1 when difference unit price is less minimum threshold for borrow orders', async () => {
      const unitPrice = 9;

      await expect(
        lendingMarketCaller
          .connect(alice)
          .createOrder(
            Side.LEND,
            '100000000000000',
            unitPrice,
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      ).to.emit(lendingMarket, 'OrderMade');

      await expect(
        lendingMarketCaller
          .connect(alice)
          .createOrder(
            Side.LEND,
            '100000000000000',
            4,
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      ).to.emit(lendingMarket, 'OrderMade');

      await expect(
        lendingMarketCaller
          .connect(bob)
          .createOrder(
            Side.BORROW,
            '100000000000000',
            '0',
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      )
        .to.emit(lendingMarket, 'OrdersTaken')
        .withArgs(
          bob.address,
          Side.BORROW,
          targetCurrency,
          maturity,
          '100000000000000',
          unitPrice,
          () => true,
        );

      await expect(
        lendingMarketCaller
          .connect(bob)
          .createOrder(
            Side.BORROW,
            '100000000000000',
            1,
            CIRCUIT_BREAKER_RATE_RANGE,
            currentMarketIdx,
          ),
      )
        .to.emit(lendingMarket, 'OrdersTaken')
        .withArgs(
          bob.address,
          Side.BORROW,
          targetCurrency,
          maturity,
          '100000000000000',
          4,
          () => true,
        );
    });

    describe('Unwind', async () => {
      it('Unwind a position partially until the circuit breaker threshold', async () => {
        await createInitialOrders(Side.LEND, 8000);

        await expect(
          lendingMarketCaller
            .connect(bob)
            .createOrder(
              Side.BORROW,
              '100000000000000',
              0,
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            ),
        ).to.emit(lendingMarket, 'OrdersTaken');

        await createInitialOrders(Side.BORROW, 8500);

        await expect(
          lendingMarketCaller
            .connect(bob)
            .unwind(
              Side.LEND,
              '125000000000000',
              CIRCUIT_BREAKER_RATE_RANGE,
              currentMarketIdx,
            ),
        )
          .to.emit(lendingMarket, 'OrdersTaken')
          .withArgs(
            bob.address,
            Side.LEND,
            targetCurrency,
            maturity,
            '100000000000000',
            8500,
            () => true,
          );
      });
    });
  });
});
