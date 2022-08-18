const ProxyController = artifacts.require('ProxyControllerV2');
const LendingMarketController = artifacts.require('LendingMarketControllerV2');
const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const CollateralAggregator = artifacts.require('CollateralAggregatorV3');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const GenesisValueToken = artifacts.require('GenesisValueToken');
const LendingMarket = artifacts.require('LendingMarketV2');

const { should, expect } = require('chai');
const { ethers, waffle } = require('hardhat');
const moment = require('moment');
const { time } = require('@openzeppelin/test-helpers');
const { deployContract, deployMockContract } = waffle;

const Side = {
  LEND: 0,
  BORROW: 1,
};

const COMPOUND_FACTOR = '1010000000000000000';

should();

contract('LendingMarketController', () => {
  let mockCurrencyController;
  let mockCollateralAggregator;
  let lendingMarketControllerProxy;

  let targetCurrency;
  let currencyIdx = 0;
  let basisDate;

  let owner, alice, bob, carol;

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock();
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

    // Deploy
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
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

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    lendingMarketControllerProxy = await ethers.getContractAt(
      'LendingMarketControllerV2',
      lendingMarketControllerAddress,
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets = [
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
      lendingMarketControllerProxy.address,
    ]);

    // Set up for LendingMarketController
    const lendingMarket = await deployContract(owner, LendingMarket);
    const genesisValueToken = await deployContract(owner, GenesisValueToken);

    await Promise.all([
      lendingMarketControllerProxy.setLendingMarketImpl(lendingMarket.address),
      lendingMarketControllerProxy.setGenesisValueTokenImpl(
        genesisValueToken.address,
      ),
    ]);
  });

  describe('Deployment', async () => {
    it('Get basisDate', async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        basisDate,
        COMPOUND_FACTOR,
      );
      const res = await lendingMarketControllerProxy.getBasisDate(
        targetCurrency,
      );

      expect(res).to.equal(basisDate);
    });

    it('Get beacon proxy implementations', async () => {
      const proxies = await Promise.all([
        lendingMarketControllerProxy.getBeaconProxyAddress(
          ethers.utils.formatBytes32String('LendingMarket'),
        ),
        lendingMarketControllerProxy.getBeaconProxyAddress(
          ethers.utils.formatBytes32String('GenesisValueToken'),
        ),
      ]);

      proxies.forEach((proxy) => {
        expect(proxy).to.exist;
        expect(proxy).to.not.equal(ethers.constants.AddressZero);
      });
    });

    it('Fail to get beacon proxy implementations', async () => {
      await expect(
        lendingMarketControllerProxy.getBeaconProxyAddress(
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

      expect(markets.length).to.equal(1);
      expect(markets[0]).to.exist;
      expect(markets[0]).to.not.equal(ethers.constants.AddressZero);
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

      expect(markets.length).to.equal(3);
      markets.forEach((market) => {
        expect(market).to.not.equal(ethers.constants.AddressZero);
        expect(market).to.exist;
      });
    });
  });

  describe('Order', async () => {
    let lendingMarketProxies;

    beforeEach(async () => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        targetCurrency,
        basisDate,
        COMPOUND_FACTOR,
      );
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);
      await lendingMarketControllerProxy.createLendingMarket(targetCurrency);

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(targetCurrency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarketV2', address),
        ),
      );
    });

    it('Add orders and rotate markets', async () => {
      const lendingMarket1 = lendingMarketProxies[0];
      const lendingMarket2 = lendingMarketProxies[1];

      await expect(
        lendingMarket1
          .connect(alice)
          .order(Side.LEND, '100000000000000000', '800'),
      ).to.emit(lendingMarket1, 'MakeOrder');
      await expect(
        lendingMarket1
          .connect(bob)
          .order(Side.LEND, '50000000000000000', '880'),
      ).to.emit(lendingMarket1, 'MakeOrder');
      await expect(
        lendingMarket1
          .connect(bob)
          .order(Side.BORROW, '100000000000000000', '720'),
      ).to.emit(lendingMarket1, 'MakeOrder');
      await expect(
        lendingMarket1
          .connect(carol)
          .order(Side.BORROW, '100000000000000000', '800'),
      ).to.emit(lendingMarket1, 'TakeOrder');

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
          alice: { PresentValue: alicePV.toString() },
          bob: { PresentValue: bobPV.toString() },
          carol: { PresentValue: carolPV.toString() },
        };
        console.table(presentValues);
      };

      await showPV();
      await time.increase(time.duration.days(92));
      await showPV();

      await lendingMarket2
        .connect(alice)
        .order(Side.LEND, '100000000000000000', '880');
      await lendingMarket2
        .connect(bob)
        .order(Side.BORROW, '50000000000000000', '880');
      await lendingMarket2
        .connect(carol)
        .order(Side.BORROW, '50000000000000000', '800');

      const borrowRates = await lendingMarketControllerProxy.getBorrowRates(
        targetCurrency,
      );
      const lendingRates = await lendingMarketControllerProxy.getLendRates(
        targetCurrency,
      );
      const midRates = await lendingMarketControllerProxy.getMidRates(
        targetCurrency,
      );
      const maturities = await lendingMarketControllerProxy.getMaturities(
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
      expect(rotatedMaturities[2].toString()).to.equal(newMaturity.toString());

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

    it('Fail to rote lending markets due to pre-maturity', async () => {
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.be.revertedWith('Market is not matured');
    });

    it('Pause lending markets', async () => {
      const lendingMarket = lendingMarketProxies[0];

      await lendingMarketControllerProxy.pauseLendingMarkets(targetCurrency);

      await expect(
        lendingMarket.connect(alice).order(0, '100000000000000000', '800'),
      ).to.be.revertedWith('Pausable: paused');

      await lendingMarketControllerProxy.unpauseLendingMarkets(targetCurrency);

      await lendingMarket.connect(alice).order(0, '100000000000000000', '800');
    });

    it('Update beacon proxy implementations and calculate Genesis value', async () => {
      const lendingMarket1 = lendingMarketProxies[0];
      const lendingMarket2 = lendingMarketProxies[1];
      const genesisValueTokenProxy = await lendingMarketControllerProxy
        .getGenesisValueToken(targetCurrency)
        .then((address) => ethers.getContractAt('GenesisValueToken', address));

      await lendingMarket1
        .connect(alice)
        .order(Side.LEND, '50000000000000000', '800');
      await lendingMarket1
        .connect(carol)
        .order(Side.LEND, '100000000000000000', '880');
      await lendingMarket1
        .connect(bob)
        .order(Side.BORROW, '50000000000000000', '800');
      await lendingMarket1
        .connect(bob)
        .order(Side.BORROW, '100000000000000000', '720');

      await lendingMarket2
        .connect(alice)
        .order(Side.LEND, '50000000000000000', '800');
      await lendingMarket2
        .connect(carol)
        .order(Side.LEND, '100000000000000000', '880');
      await lendingMarket2
        .connect(bob)
        .order(Side.BORROW, '50000000000000000', '800');
      await lendingMarket2
        .connect(bob)
        .order(Side.BORROW, '100000000000000000', '720');

      const initialCF = await genesisValueTokenProxy.compoundFactor();
      const gvDecimals = await genesisValueTokenProxy.decimals();
      const aliceInitialFV = await lendingMarket1.futureValueOf(alice.address);
      const aliceExpectedGV = aliceInitialFV
        .mul(ethers.BigNumber.from('10').pow(gvDecimals))
        .div(initialCF);

      await time.increase(time.duration.days(92));
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

      await lendingMarket1
        .connect(alice)
        .order(Side.LEND, '100000000000000000', '800');
      await lendingMarket1
        .connect(carol)
        .order(Side.BORROW, '100000000000000000', '800');

      const maturitiesBefore = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVBefore = await lendingMarketControllerProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );

      // Update implementations
      const lendingMarket = await deployContract(owner, LendingMarket);
      const genesisValueToken = await deployContract(owner, GenesisValueToken);
      await Promise.all([
        lendingMarketControllerProxy.setLendingMarketImpl(
          lendingMarket.address,
        ),
        lendingMarketControllerProxy.setGenesisValueTokenImpl(
          genesisValueToken.address,
        ),
      ]);

      const maturitiesAfter = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVAfter = await lendingMarketControllerProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );

      const totalSupplyAfter = await genesisValueTokenProxy.totalSupply();

      for (let i = 0; i < maturitiesBefore.length; i++) {
        expect(maturitiesBefore[i].toString()).to.equal(
          maturitiesAfter[i].toString(),
        );
      }

      expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
      expect(aliceGVAfter.toString()).to.equal(totalSupplyAfter.toString());
      expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
      expect(aliceGVBefore.toString()).to.equal(aliceExpectedGV.toString());
    });
  });
});
