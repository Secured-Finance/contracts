import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../../utils/constants';
import { getGenesisDate } from '../../utils/dates';
import { AUTO_ROLL_FEE_RATE, ORDER_FEE_RATE } from '../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const TokenVault = artifacts.require('TokenVault');
const CurrencyController = artifacts.require('CurrencyController');
const FutureValueVault = artifacts.require('FutureValueVault');
const GenesisValueVault = artifacts.require('GenesisValueVault');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const ReserveFund = artifacts.require('ReserveFund');
const LiquidationBot = artifacts.require('LiquidationBot');
const LiquidationBot2 = artifacts.require('LiquidationBot2');

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const QuickSort = artifacts.require('QuickSort');

const { deployContract, deployMockContract } = waffle;

const COMPOUND_FACTOR = '1020100000000000000';
const BP = ethers.BigNumber.from('10000');

describe('LendingMarketController', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;

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

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
    mockTokenVault = await deployMockContract(owner, TokenVault.abi);
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();

    // Deploy libraries
    const quickSort = await deployContract(owner, QuickSort);
    const fundManagementLogic = await ethers
      .getContractFactory('FundManagementLogic', {
        libraries: {
          QuickSort: quickSort.address,
        },
      })
      .then((factory) => factory.deploy());

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const beaconProxyController = await deployContract(
      owner,
      BeaconProxyController,
    );
    const lendingMarketController = await ethers
      .getContractFactory('LendingMarketController', {
        libraries: {
          FundManagementLogic: fundManagementLogic.address,
        },
      })
      .then((factory) => factory.deploy());
    const genesisValueVault = await deployContract(owner, GenesisValueVault);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const lendingMarketControllerAddress = await proxyController
      .setLendingMarketControllerImpl(lendingMarketController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    const beaconProxyControllerAddress = await proxyController
      .setBeaconProxyControllerImpl(beaconProxyController.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    const genesisValueVaultAddress = await proxyController
      .setGenesisValueVaultImpl(genesisValueVault.address)
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
    lendingMarketControllerProxy = await ethers.getContractAt(
      'LendingMarketController',
      lendingMarketControllerAddress,
    );
    genesisValueVaultProxy = await ethers.getContractAt(
      'GenesisValueVault',
      genesisValueVaultAddress,
    );
    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['BeaconProxyController', beaconProxyControllerProxy],
      ['CurrencyController', mockCurrencyController],
      ['ReserveFund', mockReserveFund],
      ['TokenVault', mockTokenVault],
      ['GenesisValueVault', genesisValueVaultProxy],
      ['LendingMarketController', lendingMarketControllerProxy],
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
      genesisValueVaultProxy.address,
      lendingMarketControllerProxy.address,
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
    const futureValueVault = await deployContract(owner, FutureValueVault);

    await beaconProxyControllerProxy.setLendingMarketImpl(
      lendingMarket.address,
    );
    await beaconProxyControllerProxy.setFutureValueVaultImpl(
      futureValueVault.address,
    );
  });

  describe('Deployment', async () => {
    it('Get genesisDate', async () => {
      expect(
        await lendingMarketControllerProxy.isInitializedLendingMarket(
          targetCurrency,
        ),
      ).to.equal(false);

      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
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
        COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
      );
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
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
      expect(maturities[0].toString()).to.equal(
        moment.unix(genesisDate).add(3, 'M').unix().toString(),
      );
    });

    it('Create multiple lending markets', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        genesisDate,
        COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
      );
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);

      const markets = await lendingMarketControllerProxy.getLendingMarkets(
        targetCurrency,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      expect(markets.length).to.equal(4);
      expect(maturities.length).to.equal(4);
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
        expect(maturity.toString()).to.equal(
          moment
            .unix(genesisDate)
            .add(3 * (i + 1), 'M')
            .unix()
            .toString(),
        );
      });
    });
  });

  describe('Order', async () => {
    let lendingMarketProxies: Contract[];
    let futureValueVaultProxies: Contract[];
    let maturities: BigNumber[];

    const initialize = async (currency: string) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
      );
      await lendingMarketControllerProxy.createLendingMarket(currency);
      await lendingMarketControllerProxy.createLendingMarket(currency);
      await lendingMarketControllerProxy.createLendingMarket(currency);
      await lendingMarketControllerProxy.createLendingMarket(currency);

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(currency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      );

      maturities = await lendingMarketControllerProxy.getMaturities(currency);

      futureValueVaultProxies = await Promise.all(
        maturities.map((maturity) =>
          lendingMarketControllerProxy
            .getFutureValueVault(currency, maturity)
            .then((address) =>
              ethers.getContractAt('FutureValueVault', address),
            ),
        ),
      );
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
          unitPrice: '9880',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: BigNumber.from('100000000000000000'),
          unitPrice: '9720',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: BigNumber.from('200000000000000000'),
          unitPrice: '9780',
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
      expect(borrowUnitPrices.unitPrices[0].toString()).to.equal('9780');
      expect(borrowUnitPrices.unitPrices[1].toString()).to.equal('9720');
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
      expect(lendUnitPrices.unitPrices[1].toString()).to.equal('9880');
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
          '8800',
        )
        .then(async (tx) => {
          await expect(tx).to.emit(lendingMarket1, 'MakeOrder');
          await expect(tx).to.not.emit(
            lendingMarketControllerProxy,
            'FillOrder',
          );
        });

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8880',
        )
        .then((tx) => expect(tx).to.emit(lendingMarket1, 'MakeOrder'));

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8720',
        )
        .then((tx) => expect(tx).to.emit(lendingMarket1, 'MakeOrder'));

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8800',
          ),
      ).to.emit(lendingMarketControllerProxy, 'FillOrder');

      const maturity = await lendingMarket1.getMaturity();
      expect(maturity.toString()).to.equal(
        moment.unix(genesisDate).add(3, 'M').unix().toString(),
      );

      const borrowUnitPrice = await lendingMarket1.getBorrowUnitPrice();
      expect(borrowUnitPrice.toString()).to.equal('8720');

      const lendUnitPrice = await lendingMarket1.getLendUnitPrice();
      expect(lendUnitPrice.toString()).to.equal('8880');

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

        // const futureValues1: any[] = [];
        // for (const account of accounts) {
        //   console.log('getFutureValue====================================>');
        //   const fv = await lendingMarketControllerProxy.getFutureValue(
        //     targetCurrency,
        //     maturities[1],
        //     account.address,
        //   );
        //   futureValues1.push(fv);
        // }

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
        lendingMarketControllerProxy.cleanOrders(targetCurrency, alice.address),
      ).to.emit(lendingMarketControllerProxy, 'FillOrdersAsync');
      await expect(
        lendingMarketControllerProxy.cleanOrders(targetCurrency, bob.address),
      ).to.not.emit(lendingMarketControllerProxy, 'FillOrdersAsync');

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
          '8880',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '40000000000000000',
          '8880',
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
            events.find(({ event }) => event === 'RotateLendingMarkets').args,
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
      expect(rotatedBorrowRates[2].toString()).to.equal('0');

      // Check lending rates
      expect(rotatedLendingRates[0].toString()).to.equal(
        lendingRates[1].toString(),
      );
      expect(rotatedLendingRates[1].toString()).to.equal(
        lendingRates[2].toString(),
      );
      expect(rotatedLendingRates[2].toString()).to.equal('10000');

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
      expect(rotatedMaturities[3].toString()).to.equal(newMaturity.toString());

      // Check market data
      expect(market.ccy).to.equal(targetCurrency);
      expect(market.maturity.toString()).to.equal(
        moment.unix(genesisDate).add(3, 'M').unix().toString(),
      );
      expect(market.genesisDate).to.equal(genesisDate);
      expect(market.borrowUnitPrice.toString()).to.equal('8720');
      expect(market.lendUnitPrice.toString()).to.equal('8880');
      expect(market.midUnitPrice.toString()).to.equal('8800');

      expect(rotatedMarket.ccy).to.equal(targetCurrency);
      expect(rotatedMarket.maturity.toString()).to.equal(
        newMaturity.toString(),
      );
      expect(rotatedMarket.genesisDate).to.equal(genesisDate);
      expect(rotatedMarket.borrowUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.lendUnitPrice.toString()).to.equal('10000');
      expect(rotatedMarket.midUnitPrice.toString()).to.equal('5000');

      const cleanOrders = async () => {
        for (const account of accounts) {
          await lendingMarketControllerProxy.cleanOrders(
            targetCurrency,
            account.address,
          );
        }
      };

      await showLendingInfo();
      await cleanOrders();
      await showLendingInfo();
      await cleanOrders();
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
            lendingMarketControllerProxy,
            'FillOrder',
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
            lendingMarketControllerProxy,
            'FillOrder',
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
      ).to.emit(lendingMarket1, 'CancelOrder');
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
          '9800',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9900',
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
      ).to.emit(lendingMarketControllerProxy, 'FillOrder');

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9500',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9600',
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
      ).to.emit(lendingMarketControllerProxy, 'FillOrder');

      await checkPresentValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '9000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '8900',
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
      ).to.emit(lendingMarketControllerProxy, 'FillOrder');

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
            '880',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '880',
          );

        await expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder');
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');
        await expect(tx).to.not.emit(lendingMarket1, 'MakeOrder');
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
            '880',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '880',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '880',
          );

        await expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder');
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');
        await expect(tx).to.not.emit(lendingMarket1, 'MakeOrder');
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
            '880',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(dave)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );

        const tx = await lendingMarketControllerProxy
          .connect(ellen)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '880',
          );

        await expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder');
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');
        await expect(tx)
          .to.not.emit(lendingMarket1, 'MakeOrder')
          .withArgs(
            4,
            0,
            bob.address,
            Side.LEND,
            targetCurrency,
            maturities[0],
            '100000000000000000',
            '880',
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
            '880',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '80000000000000000',
            '880',
          );
        await expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder');
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');
        await expect(tx)
          .to.emit(lendingMarket1, 'MakeOrder')
          .withArgs(
            3,
            2,
            bob.address,
            Side.LEND,
            targetCurrency,
            maturities[0],
            '20000000000000000',
            '880',
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
            '880',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );

        const tx = await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '120000000000000000',
            '880',
          );
        await expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder');
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');
        await expect(tx).to.emit(lendingMarket1, 'MakeOrder');
      });

      it('Fill an own order', async () => {
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
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '880',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '881',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              '882',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '881',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '879',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');
      });

      it('Fill multiple lending order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '881',
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
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');
      });

      it('Fill multiple borrowing order at different rates with limit rate', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '881',
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
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');
      });

      it('Fill an order partially out of the orders held', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '881',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '880',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '882',
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
            '880',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '881',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '882',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '883',
          );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '880',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '881',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '50000000000000000',
              '882',
            ),
        ).to.emit(lendingMarketControllerProxy, 'FillOrder');

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '882',
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

        const receipt = await lendingMarketControllerProxy
          .connect(users[0])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            totalAmount.toString(),
            '9880',
          )
          .then((tx) => tx.wait());

        const orderFilledEvent = receipt.events.find(
          ({ event }) => event === 'FillOrder',
        );

        expect(orderFilledEvent?.event).to.equal('FillOrder');
        const { taker, ccy, side, maturity, amount, unitPrice } =
          orderFilledEvent.args;
        expect(taker).to.equal(users[0].address);
        expect(ccy).to.equal(targetCurrency);
        expect(side).to.equal(Side.LEND);
        expect(maturity).to.equal(maturities[0]);
        expect(amount).to.equal(totalAmount);
        expect(unitPrice).to.equal('9880');
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
              String(9880 + i),
            );
        }

        const receipt = await lendingMarketControllerProxy
          .connect(users[0])
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            totalAmount.toString(),
            '9880',
          )
          .then((tx) => tx.wait());

        const orderFilledEvent = receipt.events.find(
          ({ event }) => event === 'FillOrder',
        );

        expect(orderFilledEvent?.event).to.equal('FillOrder');
        const { taker, ccy, side, maturity, amount, unitPrice } =
          orderFilledEvent.args;
        expect(taker).to.equal(users[0].address);
        expect(ccy).to.equal(targetCurrency);
        expect(side).to.equal(Side.LEND);
        expect(maturity).to.equal(maturities[0]);
        expect(amount).to.equal(totalAmount);
        expect(unitPrice).to.equal('9880');
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
              '800',
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
              '800',
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
        await mockTokenVault.mock.getLiquidationAmount.returns(1);
        await mockTokenVault.mock.getDepositAmount.returns(1);
        await mockReserveFund.mock.isPaused.returns(true);

        const isLiquidator = await lendingMarketControllerProxy.isLiquidator(
          alice.address,
        );

        if (!isLiquidator) {
          await lendingMarketControllerProxy
            .connect(alice)
            .registerLiquidator(true);
        }
      });

      it('Register a liquidator', async () => {
        expect(await lendingMarketControllerProxy.isLiquidator(owner.address))
          .to.false;

        await lendingMarketControllerProxy
          .connect(owner)
          .registerLiquidator(true);

        expect(await lendingMarketControllerProxy.isLiquidator(owner.address))
          .to.true;

        await lendingMarketControllerProxy
          .connect(owner)
          .registerLiquidator(false);

        expect(await lendingMarketControllerProxy.isLiquidator(owner.address))
          .to.false;
      });

      it("Liquidate less than 50% lending position in case the one position doesn't cover liquidation amount", async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');
        const liquidationAmount = ethers.BigNumber.from('300000000000000000');

        // Set up for the mocks
        await mockCurrencyController.mock.convertFromETH.returns('1');
        await mockTokenVault.mock.swapDepositAmounts.returns(liquidationAmount);

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
            '7999',
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
            expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder'),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
            '1',
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'Liquidate')
              .withArgs(
                signers[0].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                '200000000000000000',
              ),
          );
      });

      it('Liquidate 50% lending position in case the one position cover liquidation amount', async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');
        const liquidationAmount = ethers.BigNumber.from('80000000000000000');

        // Set up for the mocks
        await mockCurrencyController.mock.convertFromETH.returns('1');
        await mockTokenVault.mock.swapDepositAmounts.returns(liquidationAmount);

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
            '7999',
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
            expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder'),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[3].address,
            '1',
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'Liquidate')
              .withArgs(
                signers[3].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                liquidationAmount,
              ),
          );
      });

      it('Liquidate lending position using funds in the reserve fund', async () => {
        const orderAmount = ethers.BigNumber.from('100000000000000000');
        const orderRate = ethers.BigNumber.from('8000');
        const liquidationAmount = ethers.BigNumber.from('80000000000000000');
        const offsetAmount = ethers.BigNumber.from('3000000000');

        // Set up for the mocks
        await mockCurrencyController.mock.convertFromETH.returns(offsetAmount);
        await mockTokenVault.mock.swapDepositAmounts.returns(liquidationAmount);
        await mockReserveFund.mock.isPaused.returns(false);

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
            '7999',
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
            expect(tx).to.emit(lendingMarketControllerProxy, 'FillOrder'),
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[3].address,
            '1',
          )
          .then((tx) =>
            expect(tx)
              .to.emit(lendingMarketControllerProxy, 'Liquidate')
              .withArgs(
                signers[3].address,
                targetCurrency,
                targetCurrency,
                maturities[0],
                liquidationAmount.add(offsetAmount),
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
              '1',
            ),
        ).to.be.revertedWith('No debt in the selected maturity');
      });

      it('Fail to liquidate a lending position due to no liquidation amount', async () => {
        // Set up for the mocks
        await mockTokenVault.mock.getLiquidationAmount.returns(0);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeLiquidationCall(
              targetCurrency,
              targetCurrency,
              maturities[0],
              signers[0].address,
              '1',
            ),
        ).to.be.revertedWith('User has enough collateral');
      });

      it('Fail to liquidate a lending position due to unregistered liquidator', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeLiquidationCall(
              targetCurrency,
              targetCurrency,
              maturities[0],
              signers[0].address,
              '1',
            ),
        ).to.be.revertedWith('Caller is not active');
      });

      it('Fail to liquidate a lending position due to bot hack', async () => {
        await expect(
          deployContract(owner, LiquidationBot, [
            lendingMarketControllerProxy.address,
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
            '1',
          ]),
        ).to.be.revertedWith('Caller is not active');
      });

      it('Fail to liquidate a lending position due to bot access', async () => {
        const bot = await deployContract(owner, LiquidationBot2, [
          lendingMarketControllerProxy.address,
        ]);
        await bot.registerLiquidator(true);
        await expect(
          bot.executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
            '1',
          ),
        ).to.be.revertedWith('Caller must be EOA');
      });
    });

    describe('Management', async () => {
      it('Pause lending markets', async () => {
        await lendingMarketControllerProxy.pauseLendingMarkets(targetCurrency);

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              0,
              '100000000000000000',
              '800',
            ),
        ).to.be.revertedWith('Pausable: paused');

        await lendingMarketControllerProxy.unpauseLendingMarkets(
          targetCurrency,
        );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            0,
            '100000000000000000',
            '800',
          );
      });

      it('Update the order fee rate', async () => {
        expect(
          await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
        ).to.equal(ORDER_FEE_RATE);

        await lendingMarketControllerProxy.updateOrderFeeRate(
          targetCurrency,
          '200',
        );

        expect(
          await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
        ).to.equal('200');

        await lendingMarketControllerProxy.updateOrderFeeRate(
          targetCurrency,
          ORDER_FEE_RATE,
        );

        expect(
          await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
        ).to.equal(ORDER_FEE_RATE);
      });

      it('Update beacon proxy implementations and calculate Genesis value', async () => {
        const futureValueVault1 = futureValueVaultProxies[0];

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '720',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '880',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '50000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            '720',
          );

        const initialCF = await genesisValueVaultProxy.getLendingCompoundFactor(
          targetCurrency,
        );
        const gvDecimals = await genesisValueVaultProxy.decimals(
          targetCurrency,
        );
        const [aliceInitialFV] = await futureValueVault1.getFutureValue(
          alice.address,
        );
        // Use bignumber.js to round off the result
        const aliceExpectedGV = BigNumberJS(aliceInitialFV.toString())
          .times(BigNumberJS('10').pow(gvDecimals.toString()))
          .div(initialCF.toString())
          .dp(0);

        await time.increaseTo(maturities[0].toString());
        await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);
        const newMaturities = await lendingMarketControllerProxy.getMaturities(
          targetCurrency,
        );

        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              '800',
            ),
        ).to.be.revertedWith('Invalid maturity');

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 1],
            Side.LEND,
            '100000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 1],
            Side.BORROW,
            '100000000000000000',
            '800',
          );

        const maturitiesBefore =
          await lendingMarketControllerProxy.getMaturities(targetCurrency);

        const aliceGVBefore = await genesisValueVaultProxy.getGenesisValue(
          targetCurrency,
          alice.address,
        );

        // Update implementations
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

        const maturitiesAfter =
          await lendingMarketControllerProxy.getMaturities(targetCurrency);

        const aliceGVAfter = await genesisValueVaultProxy.getGenesisValue(
          targetCurrency,
          alice.address,
        );

        for (let i = 0; i < maturitiesBefore.length; i++) {
          expect(maturitiesBefore[i].toString()).to.equal(
            maturitiesAfter[i].toString(),
          );
        }

        expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
        expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
        expect(aliceGVBefore.toString()).to.equal(aliceExpectedGV.toFixed());
      });

      it('Rotate markets multiple times', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '820',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '780',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '920',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            '880',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[2],
            Side.LEND,
            '100000000000000000',
            '1020',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[2],
            Side.BORROW,
            '100000000000000000',
            '980',
          );

        await time.increaseTo(maturities[0].toString());
        await expect(
          lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'RotateLendingMarkets');

        await time.increaseTo(maturities[1].toString());
        await expect(
          lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'RotateLendingMarkets');

        const logs = await Promise.all([
          genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[0]),
          genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[1]),
          genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[2]),
        ]);

        expect(logs[0].prev).to.equal('0');
        expect(logs[0].next).to.equal(maturities[1]);
        expect(logs[0].lendingCompoundFactor).to.equal(COMPOUND_FACTOR);
        expect(logs[0].borrowingCompoundFactor).to.equal(COMPOUND_FACTOR);

        expect(logs[1].prev).to.equal(maturities[0]);
        expect(logs[1].next).to.equal(maturities[2]);
        expect(logs[1].lendingCompoundFactor).to.equal(
          logs[0].lendingCompoundFactor
            .mul(BP.pow(2).sub(logs[1].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
            .div(logs[1].unitPrice.mul(BP)),
        );
        expect(logs[1].borrowingCompoundFactor).to.equal(
          logs[0].borrowingCompoundFactor
            .mul(BP.pow(2).add(logs[1].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
            .div(logs[1].unitPrice.mul(BP)),
        );

        expect(logs[2].prev).to.equal(maturities[1]);
        expect(logs[2].next).to.equal('0');
        expect(logs[2].lendingCompoundFactor).to.equal(
          logs[1].lendingCompoundFactor
            .mul(BP.pow(2).sub(logs[2].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
            .div(logs[2].unitPrice.mul(BP)),
        );
        expect(logs[2].borrowingCompoundFactor).to.equal(
          logs[1].borrowingCompoundFactor
            .mul(BP.pow(2).add(logs[2].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
            .div(logs[2].unitPrice.mul(BP)),
        );
      });

      it('Calculate the genesis value per maturity', async () => {
        maturities = await lendingMarketControllerProxy.getMaturities(
          targetCurrency,
        );

        const rotateLendingMarkets = async () => {
          await time.increaseTo(maturities[0].toString());
          await expect(
            lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
          ).to.emit(lendingMarketControllerProxy, 'RotateLendingMarkets');

          maturities = await lendingMarketControllerProxy.getMaturities(
            targetCurrency,
          );
        };

        const cleanAllOrders = async () => {
          // console.log('\ncleanAllOrders: alice===============================');
          await lendingMarketControllerProxy.cleanAllOrders(alice.address);
          // console.log('\ncleanAllOrders: bob===============================');
          await lendingMarketControllerProxy.cleanAllOrders(bob.address);
          // console.log('\ncleanAllOrders: carol===============================');
          await lendingMarketControllerProxy.cleanAllOrders(carol.address);
          // console.log('\ncleanAllOrders: rf===============================');
          await lendingMarketControllerProxy.cleanAllOrders(
            mockReserveFund.address,
          );
        };

        const checkGenesisValue = async (checkTotalSupply = false) => {
          const accounts = [alice, bob, carol, mockReserveFund];

          const genesisValues = await Promise.all(
            accounts.map((account) =>
              lendingMarketControllerProxy.getGenesisValue(
                targetCurrency,
                account.address,
              ),
            ),
          );

          const totalSupplies = await Promise.all([
            genesisValueVaultProxy.getTotalLendingSupply(targetCurrency),
            genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency),
          ]);

          console.table({
            GenesisValue: {
              Alice: genesisValues[0].toString(),
              Bob: genesisValues[1].toString(),
              Carol: genesisValues[2].toString(),
              ReserveFund: genesisValues[3].toString(),
              TotalLendingSupply: totalSupplies[0].toString(),
              TotalBorrowingSupply: totalSupplies[1].toString(),
            },
          });

          if (checkTotalSupply) {
            expect(
              totalSupplies.reduce(
                (v, total) => total.add(v),
                BigNumber.from(0),
              ),
            ).to.equal(
              genesisValues.reduce(
                (v, total) => total.abs().add(v),
                BigNumber.from(0),
              ),
            );

            expect(totalSupplies[0]).to.equal(totalSupplies[1]);
          }
        };

        await checkGenesisValue();
        await cleanAllOrders();

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '8100',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '50000000000000000',
            '7900',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          );
        const tx = await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8000',
          );

        const lendingMarket1 = lendingMarketProxies[0];
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');

        await rotateLendingMarkets();
        await checkGenesisValue();
        await cleanAllOrders();
        await checkGenesisValue();
        await cleanAllOrders();
        await checkGenesisValue();

        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '80000000000000000',
            '8100',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '80000000000000000',
            '7900',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8000',
          );

        await rotateLendingMarkets();
        await cleanAllOrders();
        await checkGenesisValue();

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '200000000000000000',
            '8100',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '200000000000000000',
            '7900',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '8000',
          );

        await rotateLendingMarkets();
        await cleanAllOrders();
        await checkGenesisValue();

        await cleanAllOrders();
        await checkGenesisValue(true);
      });

      it('Calculate the total funds from inactive lending order list', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '40000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '8150',
          );
        await lendingMarketControllerProxy
          .connect(dave)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '500000000000000000',
            '8151',
          );

        const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
        );

        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
        );

        expect(aliceFunds.workingLendOrdersAmount).to.equal('0');
        expect(aliceFunds.claimableAmount).to.equal('40750000000000000');
        expect(bobFunds.workingBorrowOrdersAmount).to.equal(
          '60000000000000000',
        );
        expect(bobFunds.debtAmount).gt('40750000000000000');
        expect(bobFunds.borrowedAmount).to.equal('0');
      });

      it('Calculate the total funds from inactive borrowing order list', async () => {
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '30000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          );

        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '500000000000000000',
            '7500',
          );
        await lendingMarketControllerProxy
          .connect(dave)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '500000000000000000',
            '7501',
          );

        const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
        );

        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
        );

        expect(aliceFunds.workingLendOrdersAmount).to.equal(
          '70000000000000000',
        );
        expect(aliceFunds.claimableAmount).to.gt(
          bobFunds.debtAmount.mul(9950).div(10000),
        );
        expect(aliceFunds.claimableAmount).to.lt(bobFunds.debtAmount);
        expect(bobFunds.workingBorrowOrdersAmount).to.equal('0');
        expect(bobFunds.debtAmount).to.equal('28125000000000000');
        expect(bobFunds.borrowedAmount).to.equal('30000000000000000');
      });
    });
  });
});
