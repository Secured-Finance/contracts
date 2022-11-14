import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../utils/constants';
import { getBasisDate } from '../utils/dates';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const TokenVault = artifacts.require('TokenVault');
const CurrencyController = artifacts.require('CurrencyController');
const FutureValueVault = artifacts.require('FutureValueVault');
const GenesisValueVault = artifacts.require('GenesisValueVault');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');

const { deployContract, deployMockContract } = waffle;

const COMPOUND_FACTOR = '1020100000000000000';
const BP = ethers.BigNumber.from('10000');

describe('LendingMarketController', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let basisDate: number;

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
    basisDate = getBasisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ellen] = await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockTokenVault = await deployMockContract(owner, TokenVault.abi);
    await mockCurrencyController.mock.isSupportedCcy.returns(true);
    await mockTokenVault.mock.addCollateral.returns();
    await mockTokenVault.mock.removeCollateral.returns();
    await mockTokenVault.mock.depositEscrow.returns();
    await mockTokenVault.mock.withdrawEscrow.returns();

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const beaconProxyController = await deployContract(
      owner,
      BeaconProxyController,
    );
    const lendingMarketController = await deployContract(
      owner,
      LendingMarketController,
    );
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
    const lendingMarket = await deployContract(owner, LendingMarket);
    const futureValueVault = await deployContract(owner, FutureValueVault);

    await beaconProxyControllerProxy.setLendingMarketImpl(
      lendingMarket.address,
    );
    await beaconProxyControllerProxy.setFutureValueVaultImpl(
      futureValueVault.address,
    );
  });

  describe('Deployment', async () => {
    it('Get basisDate', async () => {
      expect(
        await lendingMarketControllerProxy.isInitializedLendingMarket(
          targetCurrency,
        ),
      ).to.equal(false);

      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        basisDate,
        COMPOUND_FACTOR,
      );
      const res = await lendingMarketControllerProxy.getBasisDate(
        targetCurrency,
      );

      expect(res).to.equal(basisDate);
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
        basisDate,
        COMPOUND_FACTOR,
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
        moment.unix(basisDate).add(3, 'M').unix().toString(),
      );
    });

    it('Create multiple lending markets', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        basisDate,
        COMPOUND_FACTOR,
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
            .unix(basisDate)
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

    beforeEach(async () => {
      // Set up for the mocks
      await mockTokenVault.mock.isCovered.returns(true);

      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        basisDate,
        COMPOUND_FACTOR,
      );
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(targetCurrency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      );

      maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      futureValueVaultProxies = await Promise.all(
        maturities.map((maturity) =>
          lendingMarketControllerProxy
            .getFutureValueVault(targetCurrency, maturity)
            .then((address) =>
              ethers.getContractAt('FutureValueVault', address),
            ),
        ),
      );
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
          amount: '100000000000000000',
          unitPrice: '9800',
        },
        {
          maker: bob,
          side: Side.LEND,
          amount: '500000000000000000',
          unitPrice: '9880',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: '100000000000000000',
          unitPrice: '9720',
        },
        {
          maker: carol,
          side: Side.BORROW,
          amount: '200000000000000000',
          unitPrice: '9780',
        },
      ];

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
      const lendingMarket1 = lendingMarketProxies[0];
      const futureValueVault1 = futureValueVaultProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9800',
        )
        .then(async (tx) => {
          await expect(tx).to.emit(lendingMarket1, 'MakeOrder');
          await expect(tx).to.emit(lendingMarketControllerProxy, 'PlaceOrder');
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
          '9880',
        )
        .then((tx) => expect(tx).to.emit(lendingMarket1, 'MakeOrder'));

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9720',
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
            '9800',
          ),
      ).to.emit(lendingMarketControllerProxy, 'FillOrder');

      const maturity = await lendingMarket1.getMaturity();
      expect(maturity.toString()).to.equal(
        moment.unix(basisDate).add(3, 'M').unix().toString(),
      );

      const borrowUnitPrice = await lendingMarket1.getBorrowUnitPrice();
      expect(borrowUnitPrice.toString()).to.equal('9720');

      const lendUnitPrice = await lendingMarket1.getLendUnitPrice();
      expect(lendUnitPrice.toString()).to.equal('9880');

      const midUnitPrice = await lendingMarket1.getMidUnitPrice();
      expect(midUnitPrice.toString()).to.equal('9800');

      const showFV = async () => {
        const aliceFV = await futureValueVault1.getFutureValue(alice.address);
        const bobFV = await futureValueVault1.getFutureValue(bob.address);
        const carolFV = await futureValueVault1.getFutureValue(carol.address);

        const presentValues = {
          FutureValue: {
            Alice: aliceFV.futureValue.toString(),
            Bob: bobFV.futureValue.toString(),
            Carol: carolFV.futureValue.toString(),
          },
        };
        console.table(presentValues);
      };

      const showTotalPV = async () => {
        const aliceTotalPV =
          await lendingMarketControllerProxy.getTotalPresentValue(
            targetCurrency,
            alice.address,
          );
        const bobTotalPV =
          await lendingMarketControllerProxy.getTotalPresentValue(
            targetCurrency,
            bob.address,
          );
        const carolTotalPV =
          await lendingMarketControllerProxy.getTotalPresentValue(
            targetCurrency,
            carol.address,
          );

        const totalPresentValues = {
          TotalPresentValue: {
            Alice: aliceTotalPV.toString(),
            Bob: bobTotalPV.toString(),
            Carol: carolTotalPV.toString(),
          },
        };
        console.table(totalPresentValues);
      };

      expect(await lendingMarket1.isOpened()).to.equal(true);

      await expect(
        lendingMarketControllerProxy.cleanOrders(alice.address),
      ).to.emit(lendingMarketControllerProxy, 'FillOrdersAsync');
      await expect(
        lendingMarketControllerProxy.cleanOrders(bob.address),
      ).to.not.emit(lendingMarketControllerProxy, 'FillOrdersAsync');

      await showFV();
      await showTotalPV();
      await time.increaseTo(maturities[0].toString());
      // await showPV();

      expect(await lendingMarket1.isOpened()).to.equal(false);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '40000000000000000',
          '9880',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '9800',
        );

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

      await showTotalPV();

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
      expect(rotatedLendingRates[2].toString()).to.equal('0');

      // Check mid rates
      expect(rotatedMidRates[0].toString()).to.equal(
        midUnitPrices[1].toString(),
      );
      expect(rotatedMidRates[1].toString()).to.equal(
        midUnitPrices[2].toString(),
      );
      expect(rotatedMidRates[2].toString()).to.equal('0');

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
        moment.unix(basisDate).add(3, 'M').unix().toString(),
      );
      expect(market.basisDate).to.equal(basisDate);
      expect(market.borrowUnitPrice.toString()).to.equal('9720');
      expect(market.lendUnitPrice.toString()).to.equal('9880');
      expect(market.midUnitPrice.toString()).to.equal('9800');

      expect(rotatedMarket.ccy).to.equal(targetCurrency);
      expect(rotatedMarket.maturity.toString()).to.equal(
        newMaturity.toString(),
      );
      expect(rotatedMarket.basisDate).to.equal(basisDate);
      expect(rotatedMarket.borrowUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.lendUnitPrice.toString()).to.equal('0');
      expect(rotatedMarket.midUnitPrice.toString()).to.equal('0');

      console.log('cleanOrders: alice!!!');
      await lendingMarketControllerProxy.cleanOrders(alice.address);
      await showTotalPV();
      // Check the total present value
      // const aliceTotalPV =
      //   await lendingMarketControllerProxy.getTotalPresentValue(
      //     targetCurrency,
      //     alice.address,
      //   );
      // const bobTotalPV =
      //   await lendingMarketControllerProxy.getTotalPresentValue(
      //     targetCurrency,
      //     bob.address,
      //   );
      // const carolTotalPV =
      //   await lendingMarketControllerProxy.getTotalPresentValue(
      //     targetCurrency,
      //     carol.address,
      //   );
      // const rate1 = await lendingMarket1.getMidUnitPrice();
      // const rate2 = await lendingMarket2.getMidUnitPrice();
      // const aliceFV1 = await futureValueVault1.getFutureValue(alice.address);
      // const aliceFV2 = await futureValueVault2.getFutureValue(alice.address);
      // console.log('rate1:', rate1);
      // console.log('rate2:', rate2);
      // console.log('aliceFV1.futureValue:', aliceFV1.futureValue.toString());
      // console.log('aliceFV2.futureValue:', aliceFV2.futureValue.toString());
      // console.log('aliceTotalPV:', aliceTotalPV.toString());

      // expect(aliceTotalPV.toString()).to.equal(
      //   aliceFV1.futureValue
      //     .mul(rate1)
      //     .div(10000)
      //     .add(aliceFV2.futureValue.mul(rate2).div(10000))
      //     .toString(),
      // );
    });

    it('Add an order(payable)', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createLendOrderWithETH(targetCurrency, maturities[0], '800', {
          value: '100000000000000000',
        })
        .then(async (tx) => {
          await expect(tx).to.emit(lendingMarketControllerProxy, 'PlaceOrder');
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
        await expect(tx).to.not.emit(lendingMarket1, 'MakeOrder');
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
        ).not.to.be.revertedWith('Not enough collateral');

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

        const initialCF = await genesisValueVaultProxy.getCompoundFactor(
          targetCurrency,
        );
        const gvDecimals = await genesisValueVaultProxy.decimals(
          targetCurrency,
        );
        const [aliceInitialFV] = await futureValueVault1.getFutureValue(
          alice.address,
        );
        const aliceExpectedGV = aliceInitialFV
          .mul(ethers.BigNumber.from('10').pow(gvDecimals))
          .div(initialCF);

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
        const lendingMarket = await deployContract(owner, LendingMarket);
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
        expect(aliceGVBefore.toString()).to.equal(aliceExpectedGV.toString());
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

        const maturityUnitPrices = await Promise.all([
          genesisValueVaultProxy.getMaturityUnitPrice(
            targetCurrency,
            maturities[0],
          ),
          genesisValueVaultProxy.getMaturityUnitPrice(
            targetCurrency,
            maturities[1],
          ),
          genesisValueVaultProxy.getMaturityUnitPrice(
            targetCurrency,
            maturities[2],
          ),
        ]);

        expect(maturityUnitPrices[0].prev.toString()).to.equal('0');
        expect(maturityUnitPrices[0].next.toString()).to.equal(maturities[1]);
        expect(maturityUnitPrices[0].compoundFactor.toString()).to.equal(
          COMPOUND_FACTOR,
        );

        const expectedCompoundFactorInMarket1 =
          maturityUnitPrices[0].compoundFactor
            .mul(BP)
            .div(maturityUnitPrices[1].unitPrice)
            .toString();

        expect(maturityUnitPrices[1].prev.toString()).to.equal(maturities[0]);
        expect(maturityUnitPrices[1].next.toString()).to.equal(maturities[2]);
        expect(maturityUnitPrices[1].compoundFactor.toString()).to.equal(
          expectedCompoundFactorInMarket1,
        );

        const expectedCompoundFactorInMarket2 =
          maturityUnitPrices[1].compoundFactor
            .mul(BP)
            .div(maturityUnitPrices[2].unitPrice)
            .toString();

        expect(maturityUnitPrices[2].prev.toString()).to.equal(maturities[1]);
        expect(maturityUnitPrices[2].next.toString()).to.equal('0');
        expect(maturityUnitPrices[2].compoundFactor.toString()).to.equal(
          expectedCompoundFactorInMarket2,
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

        const convertAllFutureValueToGenesisValue = async () => {
          await lendingMarketControllerProxy.convertFutureValueToGenesisValue(
            alice.address,
          );
          await lendingMarketControllerProxy.convertFutureValueToGenesisValue(
            bob.address,
          );
          await lendingMarketControllerProxy.convertFutureValueToGenesisValue(
            carol.address,
          );
        };

        const cleanAllOrders = async () => {
          await lendingMarketControllerProxy.cleanOrders(alice.address);
          await lendingMarketControllerProxy.cleanOrders(bob.address);
          await lendingMarketControllerProxy.cleanOrders(carol.address);
        };

        const checkGenesisValue = async () => {
          const accounts = [alice, bob, carol];

          const genesisValues = await Promise.all(
            accounts.map((account) =>
              genesisValueVaultProxy.getGenesisValue(
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
              TotalLendingSupply: totalSupplies[0].toString(),
              TotalBorrowingSupply: totalSupplies[1].toString(),
            },
          });

          expect(
            totalSupplies
              .reduce((v, total) => total.add(v), ethers.BigNumber.from(0))
              .toString(),
          ).to.equal(
            genesisValues
              .reduce(
                (v, total) => total.abs().add(v),
                ethers.BigNumber.from(0),
              )
              .toString(),
          );
        };

        await convertAllFutureValueToGenesisValue();
        await checkGenesisValue();
        await cleanAllOrders();

        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '810',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '50000000000000000',
            '790',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '800',
          );
        const tx = await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '800',
          );

        const lendingMarket1 = lendingMarketProxies[0];
        await expect(tx).to.emit(lendingMarket1, 'TakeOrders');

        await rotateLendingMarkets();
        await convertAllFutureValueToGenesisValue();
        await cleanAllOrders();
        await checkGenesisValue();
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '80000000000000000',
            '810',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '80000000000000000',
            '790',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '800',
          );

        await rotateLendingMarkets();
        await convertAllFutureValueToGenesisValue();
        await cleanAllOrders();
        await checkGenesisValue();

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '200000000000000000',
            '810',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '200000000000000000',
            '790',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '800',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '800',
          );

        await rotateLendingMarkets();
        await convertAllFutureValueToGenesisValue();
        await cleanAllOrders();
        await checkGenesisValue();

        await convertAllFutureValueToGenesisValue();
        await checkGenesisValue();
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

        const aliceLentFunds =
          await lendingMarketControllerProxy.calculateLentFundsFromOrders(
            targetCurrency,
            alice.address,
          );

        const bobBorrowedFunds =
          await lendingMarketControllerProxy.calculateBorrowedFundsFromOrders(
            targetCurrency,
            bob.address,
          );

        expect(aliceLentFunds.workingOrdersAmount).to.equal('0');
        expect(aliceLentFunds.claimableAmount).to.equal('40750000000000000');
        expect(bobBorrowedFunds.workingOrdersAmount).to.equal(
          '60000000000000000',
        );
        expect(bobBorrowedFunds.obligationAmount).to.equal('0');
        expect(bobBorrowedFunds.borrowedAmount).to.equal('0');
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

        const aliceLentFunds =
          await lendingMarketControllerProxy.calculateLentFundsFromOrders(
            targetCurrency,
            alice.address,
          );

        const bobBorrowedFunds =
          await lendingMarketControllerProxy.calculateBorrowedFundsFromOrders(
            targetCurrency,
            bob.address,
          );

        expect(aliceLentFunds.workingOrdersAmount).to.equal(
          '70000000000000000',
        );
        expect(aliceLentFunds.claimableAmount).to.equal('0');
        expect(bobBorrowedFunds.workingOrdersAmount).to.equal('0');
        expect(bobBorrowedFunds.obligationAmount).to.equal('28125000000000000');
        expect(bobBorrowedFunds.borrowedAmount).to.equal('30000000000000000');
      });
    });
  });
});
