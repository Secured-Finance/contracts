import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../../utils/constants';
import { getGenesisDate } from '../../utils/dates';
import {
  AUTO_ROLL_FEE_RATE,
  INITIAL_COMPOUND_FACTOR,
  MARKET_BASE_PERIOD,
  MARKET_OBSERVATION_PERIOD,
  ORDER_FEE_RATE,
  PRICE_DIGIT,
} from '../common/constants';
import { calculateFutureValue } from '../common/orders';

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

// libraries
const LendingMarketOperationLogic = artifacts.require(
  'LendingMarketOperationLogic',
);
const OrderBookLogic = artifacts.require('OrderBookLogic');
const QuickSort = artifacts.require('QuickSort');

const { deployContract, deployMockContract } = waffle;

const BP = ethers.BigNumber.from(PRICE_DIGIT);

describe('LendingMarketController - Itayose', () => {
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
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, ...signers] = await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
    mockTokenVault = await deployMockContract(owner, TokenVault.abi);
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockTokenVault.mock.isCovered.returns(true);

    // Deploy libraries
    const quickSort = await deployContract(owner, QuickSort);
    const lendingMarketOperationLogic = await deployContract(
      owner,
      LendingMarketOperationLogic,
    );
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
          LendingMarketOperationLogic: lendingMarketOperationLogic.address,
        },
      })
      .then((factory) => factory.deploy());
    const genesisValueVault = await deployContract(owner, GenesisValueVault);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const lendingMarketControllerAddress = await proxyController
      .setLendingMarketControllerImpl(
        lendingMarketController.address,
        MARKET_BASE_PERIOD,
        MARKET_OBSERVATION_PERIOD,
      )
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

  describe('Itayose', async () => {
    let lendingMarketProxies: Contract[];
    let futureValueVaultProxy: Contract;
    let maturities: BigNumber[];

    const createLendingMarkets = async (
      currency: string,
      openingDate = genesisDate,
    ) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          currency,
          openingDate,
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

    it('Execute Itayose call on the initial markets', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const openingDate = moment(timestamp * 1000)
        .add(2, 'h')
        .unix();

      await createLendingMarkets(targetCurrency, openingDate);

      await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);

      await genesisValueVaultProxy
        .getLatestAutoRollLog(targetCurrency)
        .then(
          ({
            unitPrice,
            lendingCompoundFactor,
            borrowingCompoundFactor,
            next,
            prev,
          }) => {
            expect(unitPrice).to.equal('10000');
            expect(lendingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
            expect(borrowingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
            expect(next).to.equal('0');
            expect(prev).to.equal('0');
          },
        );

      const orders = [
        {
          side: Side.BORROW,
          unitPrice: '8500',
          amount: '300000000000000',
          user: carol,
        },
        {
          side: Side.BORROW,
          unitPrice: '8000',
          amount: '100000000000000',
          user: alice,
        },
        {
          side: Side.LEND,
          unitPrice: '8300',
          amount: '200000000000000',
          user: bob,
        },
      ];

      // the matching amount of the above orders
      const expectedFilledAmount = BigNumber.from('200000000000000');

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
              targetCurrency,
              maturities[0],
              order.side,
              order.amount,
              order.unitPrice,
            ),
        ).to.emit(lendingMarketProxies[0], 'OrderMade');

        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
              targetCurrency,
              maturities[1],
              order.side,
              order.amount,
              order.unitPrice,
            ),
        ).to.emit(lendingMarketProxies[1], 'OrderMade');
      }

      await time.increaseTo(openingDate);

      // Execute Itayose call on the first market
      await expect(
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.emit(lendingMarketProxies[0], 'ItayoseExecuted');

      const openingPrice = await lendingMarketProxies[0].getOpeningUnitPrice();

      expect(openingPrice).to.equal('8300');

      futureValueVaultProxy = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency, maturities[0])
        .then((address) => ethers.getContractAt('FutureValueVault', address));

      const totalSupplyAfterItayoseExecuted =
        await futureValueVaultProxy.getTotalSupply(maturities[0]);

      expect(
        totalSupplyAfterItayoseExecuted.sub(
          calculateFutureValue(expectedFilledAmount, openingPrice),
        ),
      ).lte(1);

      const currentLendingCompoundFactor = await genesisValueVaultProxy
        .getLatestAutoRollLog(targetCurrency)
        .then(
          ({
            unitPrice,
            lendingCompoundFactor,
            borrowingCompoundFactor,
            next,
            prev,
          }) => {
            expect(unitPrice).to.lt(openingPrice);
            expect(lendingCompoundFactor).to.gt(INITIAL_COMPOUND_FACTOR);
            expect(lendingCompoundFactor).to.equal(borrowingCompoundFactor);
            expect(next).to.equal('0');
            expect(prev).to.equal('0');
            return lendingCompoundFactor;
          },
        );

      // Execute Itayose calls on all markets except the first and last.
      for (let i = 1; i < lendingMarketProxies.length - 1; i++) {
        const isOpenedBefore = await lendingMarketProxies[i].isOpened();
        expect(isOpenedBefore).to.false;

        await lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[i],
        );

        const isOpenedAfter = await lendingMarketProxies[i].isOpened();
        const { lendingCompoundFactor } =
          await genesisValueVaultProxy.getLatestAutoRollLog(targetCurrency);

        expect(isOpenedAfter).to.true;
        expect(lendingCompoundFactor).to.equal(currentLendingCompoundFactor);
      }
    });

    it('Execute Itayose call after auto-rolling', async () => {
      await createLendingMarkets(targetCurrency);

      await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
      const lendingMarket = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8800',
        );

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);
      maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      // Move to 48 hours (172800 sec) before maturity.
      await time.increaseTo(maturities[0].sub(172800).toString());

      const orders = [
        {
          side: Side.BORROW,
          unitPrice: '8500',
          amount: '300000000000000',
          user: carol,
        },
        {
          side: Side.BORROW,
          unitPrice: '8000',
          amount: '100000000000000',
          user: alice,
        },
        {
          side: Side.LEND,
          unitPrice: '8300',
          amount: '200000000000000',
          user: bob,
        },
      ];

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
              targetCurrency,
              maturities[maturities.length - 1],
              order.side,
              order.amount,
              order.unitPrice,
            ),
        ).to.emit(lendingMarket, 'OrderMade');
      }

      await time.increaseTo(maturities[maturities.length - 2].toString());

      await expect(
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[maturities.length - 1],
        ),
      ).to.emit(lendingMarket, 'ItayoseExecuted');

      const openingPrice = await lendingMarket.getOpeningUnitPrice();

      expect(openingPrice).to.equal('8300');

      const [aliceFV, bobFV, carolFV] = await Promise.all(
        [alice, bob, carol].map((account) =>
          lendingMarketControllerProxy.getFutureValue(
            targetCurrency,
            maturities[maturities.length - 1],
            account.address,
          ),
        ),
      );

      expect(aliceFV).to.equal(
        BigNumber.from('-100000000000000').mul(BP).div(openingPrice),
      );
      expect(bobFV).to.equal(
        BigNumber.from('100000000000000').mul(BP).div(openingPrice),
      );
      expect(carolFV).to.equal('0');
    });
  });
});
