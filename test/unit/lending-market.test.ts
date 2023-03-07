import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { Side } from '../../utils/constants';
import { getGenesisDate } from '../../utils/dates';

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

  describe('Order', async () => {
    let lendingMarket: Contract;
    let lendingMarketCount: number = 0;

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
        .then((addresses) =>
          ethers.getContractAt('LendingMarket', addresses[lendingMarketCount]),
        );

      lendingMarketCount++;
    });

    describe('Itayose', async () => {
      const tests = [
        {
          openingPrice: '8300',
          orders: [
            { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
            { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
            { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
            { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
          ],
        },
        {
          openingPrice: '8000',
          orders: [
            { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
            { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
            { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
            { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
          ],
        },
        {
          openingPrice: '8150',
          orders: [
            { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
            { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
            { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
            { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
          ],
        },
        {
          openingPrice: '9000',
          orders: [
            { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
            { side: Side.BORROW, unitPrice: '8500', amount: '100000000000000' },
            { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
            { side: Side.LEND, unitPrice: '9000', amount: '300000000000000' },
          ],
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
                  lendingMarketCount - 1,
                ),
            ).to.emit(lendingMarket, 'OrderMade');
          }

          // Increase 47 hours
          await time.increase(169200);

          await expect(lendingMarket.executeItayoseCall()).to.emit(
            lendingMarket,
            'ItayoseExecuted',
          );

          const openingPrice = await lendingMarket.getOpeningUnitPrice();

          expect(openingPrice).to.equal(test.openingPrice);
        });
      }

      it('Execute Itayose call without pre-orders', async () => {
        // Increase 47 hours
        await time.increase(169200);

        await expect(lendingMarket.executeItayoseCall()).to.not.emit(
          lendingMarket,
          'ItayoseExecuted',
        );
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
        await expect(lendingMarket.executeItayoseCall()).to.be.revertedWith(
          'Not in the Itayose period',
        );
      });
    });
  });
});
