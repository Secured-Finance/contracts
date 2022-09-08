import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';
import { Side } from '../utils/constants';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const CollateralAggregator = artifacts.require('CollateralAggregator');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');

const { deployContract, deployMockContract } = waffle;

const COMPOUND_FACTOR = '1020100000000000000';
const SECONDS_IN_YEAR = ethers.BigNumber.from('31557600');
const BP = ethers.BigNumber.from('10000');

describe('LendingMarketController', () => {
  let mockCurrencyController: MockContract;
  let mockCollateralAggregator: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let basisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    basisDate = moment(timestamp * 1000).unix();
  });

  before(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockCollateralAggregator = await deployMockContract(
      owner,
      CollateralAggregator.abi,
    );
    await mockCurrencyController.mock.isSupportedCcy.returns(true);
    await mockCollateralAggregator.mock.useUnsettledCollateral.returns();
    await mockCollateralAggregator.mock.releaseUnsettledCollateral.returns();
    await mockCollateralAggregator.mock.addEscrowedAmount.returns();
    await mockCollateralAggregator.mock.removeEscrowedAmount.returns();

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

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['BeaconProxyController', beaconProxyControllerProxy],
      ['CurrencyController', mockCurrencyController],
      ['CollateralAggregator', mockCollateralAggregator],
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
      lendingMarketControllerProxy.address,
    ]);

    // Set up for LendingMarketController
    const lendingMarket = await deployContract(owner, LendingMarket);

    await beaconProxyControllerProxy.setLendingMarketImpl(
      lendingMarket.address,
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

      const markets = await lendingMarketControllerProxy.getLendingMarkets(
        targetCurrency,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      expect(markets.length).to.equal(3);
      expect(maturities.length).to.equal(3);
      markets.forEach((market) => {
        expect(market).to.not.equal(ethers.constants.AddressZero);
        expect(market).to.exist;
      });
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

    beforeEach(async () => {
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
    });

    it('Add orders and check rates', async () => {
      const lendingMarket3 = lendingMarketProxies[3];
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[3],
          Side.LEND,
          '100000000000000000',
          '800',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[3],
          Side.LEND,
          '50000000000000000',
          '880',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[3],
          Side.BORROW,
          '100000000000000000',
          '720',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[3],
          Side.BORROW,
          '100000000000000000',
          '780',
        );

      const borrowRates = await lendingMarket3.getBorrowRates(10);
      expect(borrowRates[0].toString()).to.equal('780');
      expect(borrowRates[1].toString()).to.equal('720');
      expect(borrowRates[2].toString()).to.equal('0');
      expect(borrowRates.length).to.equal(10);

      const lendRates = await lendingMarket3.getLendRates(10);
      expect(lendRates[0].toString()).to.equal('800');
      expect(lendRates[1].toString()).to.equal('880');
      expect(lendRates[2].toString()).to.equal('0');
      expect(lendRates.length).to.equal(10);
    });

    it('Add orders and rotate markets', async () => {
      const lendingMarket1 = lendingMarketProxies[0];
      const lendingMarket2 = lendingMarketProxies[1];
      const maturities = await lendingMarketControllerProxy.getMaturities(
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
      ).to.emit(lendingMarket1, 'MakeOrder');
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '880',
          ),
      ).to.emit(lendingMarket1, 'MakeOrder');
      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '720',
          ),
      ).to.emit(lendingMarket1, 'MakeOrder');
      expect(
        await lendingMarketControllerProxy
          .connect(carol)
          .matchOrders(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '800',
          ),
      ).to.equal(true);

      const tx = lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '800',
        );
      await expect(tx).to.emit(lendingMarket1, 'TakeOrder');
      await expect(tx)
        .to.emit(lendingMarketControllerProxy, 'OrderFilled')
        .withArgs(
          1,
          alice.address,
          carol.address,
          targetCurrency,
          maturities[0],
          '100000000000000000',
          '800',
        );

      const maturity = await lendingMarket1.getMaturity();
      expect(maturity.toString()).to.equal(
        moment.unix(basisDate).add(3, 'M').unix().toString(),
      );

      const borrowRate = await lendingMarket1.getBorrowRate();
      expect(borrowRate.toString()).to.equal('720');

      const lendRate = await lendingMarket1.getLendRate();
      expect(lendRate.toString()).to.equal('880');

      const midRate = await lendingMarket1.getMidRate();
      expect(midRate.toString()).to.equal('800');

      const showPV = async () => {
        const alicePV = await lendingMarket1.presentValueOf(alice.address);
        const bobPV = await lendingMarket1.presentValueOf(bob.address);
        const carolPV = await lendingMarket1.presentValueOf(carol.address);

        const presentValues = {
          PresentValue: {
            Alice: alicePV.toString(),
            Bob: bobPV.toString(),
            Carol: carolPV.toString(),
          },
        };
        console.table(presentValues);
      };

      expect(await lendingMarket1.isOpened()).to.equal(true);

      await showPV();
      await time.increase(time.duration.days(92));
      await showPV();

      expect(await lendingMarket1.isOpened()).to.equal(false);

      await lendingMarketControllerProxy
        .connect(alice)
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
          '880',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '800',
        );

      const borrowRates = await lendingMarketControllerProxy.getBorrowRates(
        targetCurrency,
      );
      const lendingRates = await lendingMarketControllerProxy.getLendRates(
        targetCurrency,
      );
      const midRates = await lendingMarketControllerProxy.getMidRates(
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

      const rotatedBorrowRates =
        await lendingMarketControllerProxy.getBorrowRates(targetCurrency);
      const rotatedLendingRates =
        await lendingMarketControllerProxy.getLendRates(targetCurrency);
      const rotatedMidRates = await lendingMarketControllerProxy.getMidRates(
        targetCurrency,
      );
      const rotatedMaturities =
        await lendingMarketControllerProxy.getMaturities(targetCurrency);
      const rotatedMarket = await lendingMarket1.getMarket();

      // Check borrow rates
      expect(rotatedBorrowRates[0].toString()).to.equal(
        borrowRates[1].toString(),
      );
      expect(rotatedBorrowRates[1].toString()).to.equal(
        borrowRates[2].toString(),
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
      expect(rotatedMidRates[0].toString()).to.equal(midRates[1].toString());
      expect(rotatedMidRates[1].toString()).to.equal(midRates[2].toString());
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
      expect(market.borrowRate.toString()).to.equal('720');
      expect(market.lendRate.toString()).to.equal('880');
      expect(market.midRate.toString()).to.equal('800');

      expect(rotatedMarket.ccy).to.equal(targetCurrency);
      expect(rotatedMarket.maturity.toString()).to.equal(
        newMaturity.toString(),
      );
      expect(rotatedMarket.basisDate).to.equal(basisDate);
      expect(rotatedMarket.borrowRate.toString()).to.equal('0');
      expect(rotatedMarket.lendRate.toString()).to.equal('0');
      expect(rotatedMarket.midRate.toString()).to.equal('0');

      // Check the total present value
      const aliceTotalPV =
        await lendingMarketControllerProxy.getTotalPresentValue(
          targetCurrency,
          alice.address,
        );
      const alicePV1 = await lendingMarket1.presentValueOf(alice.address);
      const alicePV2 = await lendingMarket2.presentValueOf(alice.address);

      expect(aliceTotalPV.toString()).to.equal(
        alicePV1.add(alicePV2).toString(),
      );
    });

    it('Fail to check if the lending order is matching', async () => {
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .matchOrders(targetCurrency, maturities[0], Side.LEND, '99', '999'),
      ).to.be.revertedWith('No orders exists for selected interest rate');
    });

    it('Fail to check if the borrowing order is matching', async () => {
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .matchOrders(targetCurrency, maturities[0], Side.BORROW, '99', '999'),
      ).to.be.revertedWith('No orders exists for selected interest rate');
    });

    it('Fail to rote lending markets due to pre-maturity', async () => {
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.be.revertedWith('Market is not matured');
    });

    it('Pause lending markets', async () => {
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

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

      await lendingMarketControllerProxy.unpauseLendingMarkets(targetCurrency);

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
      const lendingMarket1 = lendingMarketProxies[0];
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

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

      const initialCF = await lendingMarketControllerProxy.getCompoundFactor(
        targetCurrency,
      );
      const gvDecimals = await lendingMarketControllerProxy.decimals(
        targetCurrency,
      );
      const aliceInitialFV = await lendingMarket1.futureValueOf(alice.address);
      const aliceExpectedGV = aliceInitialFV
        .mul(ethers.BigNumber.from('10').pow(gvDecimals))
        .div(initialCF);

      await time.increase(time.duration.days(92));
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

      const maturitiesBefore = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVBefore = await lendingMarketControllerProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );

      // Update implementations
      const lendingMarket = await deployContract(owner, LendingMarket);
      await beaconProxyControllerProxy.setLendingMarketImpl(
        lendingMarket.address,
      );

      const maturitiesAfter = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVAfter = await lendingMarketControllerProxy.getGenesisValue(
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
      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

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

      await time.increase(time.duration.days(92));
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      await time.increase(time.duration.days(92));
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      const maturityRates = await Promise.all([
        lendingMarketControllerProxy.getMaturityRate(
          targetCurrency,
          maturities[0],
        ),
        lendingMarketControllerProxy.getMaturityRate(
          targetCurrency,
          maturities[1],
        ),
        lendingMarketControllerProxy.getMaturityRate(
          targetCurrency,
          maturities[2],
        ),
      ]);

      expect(maturityRates[0].prev.toString()).to.equal('0');
      expect(maturityRates[0].next.toString()).to.equal(maturities[1]);
      expect(maturityRates[0].compoundFactor.toString()).to.equal(
        COMPOUND_FACTOR,
      );

      const expectedCompoundFactorInMarket1 = maturityRates[0].compoundFactor
        .mul(
          maturityRates[1].rate
            .mul(maturityRates[1].tenor)
            .add(BP.mul(SECONDS_IN_YEAR)),
        )
        .div(SECONDS_IN_YEAR.mul(BP))
        .toString();

      expect(maturityRates[1].prev.toString()).to.equal(maturities[0]);
      expect(maturityRates[1].next.toString()).to.equal(maturities[2]);
      expect(maturityRates[1].compoundFactor.toString()).to.equal(
        expectedCompoundFactorInMarket1,
      );

      const expectedCompoundFactorInMarket2 = maturityRates[1].compoundFactor
        .mul(
          maturityRates[2].rate
            .mul(maturityRates[2].tenor)
            .add(BP.mul(SECONDS_IN_YEAR)),
        )
        .div(SECONDS_IN_YEAR.mul(BP))
        .toString();

      expect(maturityRates[2].prev.toString()).to.equal(maturities[1]);
      expect(maturityRates[2].next.toString()).to.equal('0');
      expect(maturityRates[2].compoundFactor.toString()).to.equal(
        expectedCompoundFactorInMarket2,
      );
    });

    it('Calculate the genesis value per maturity', async () => {
      let maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const rotateLendingMarkets = async () => {
        await time.increase(time.duration.days(92));
        await expect(
          lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

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

      const checkGenesisValue = async () => {
        const accounts = [alice, bob, carol];

        const genesisValues = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getGenesisValue(
              targetCurrency,
              account.address,
            ),
          ),
        );

        const totalSupplies = await Promise.all([
          lendingMarketControllerProxy.getTotalLendingSupply(targetCurrency),
          lendingMarketControllerProxy.getTotalBorrowingSupply(targetCurrency),
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
            .reduce((v, total) => total.abs().add(v), ethers.BigNumber.from(0))
            .toString(),
        );
      };

      await convertAllFutureValueToGenesisValue();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '810',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
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
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '800',
        );

      await rotateLendingMarkets();
      await convertAllFutureValueToGenesisValue();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '810',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
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
      await checkGenesisValue();
    });
  });
});
