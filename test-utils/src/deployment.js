const AddressResolver = artifacts.require('AddressResolver');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const CrosschainAddressResolver = artifacts.require(
  'CrosschainAddressResolver',
);
const CurrencyController = artifacts.require('CurrencyController');
const Liquidations = artifacts.require('Liquidations');
const MarkToMarket = artifacts.require('MarkToMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const PaymentAggregator = artifacts.require('PaymentAggregator');
const WETH9Mock = artifacts.require('WETH9Mock');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');

const { ethers } = require('hardhat');

const {
  loanPrefix,
  hexBTCString,
  hexETHString,
  hexFILString,
  zeroAddress,
  toBytes32,
} = require('./strings');
const { btcToETHRate, ethToUSDRate, filToETHRate } = require('./numbers');

const deployContracts = async (mockCallbacks) => {
  // Deploy libraries
  const DealId = await ethers.getContractFactory('DealId');
  const dealIdLibrary = await DealId.deploy();
  await dealIdLibrary.deployed();

  const QuickSort = await ethers.getContractFactory('QuickSort');
  const quickSortLibrary = await QuickSort.deploy();
  await quickSortLibrary.deployed();

  const DiscountFactor = await ethers.getContractFactory('DiscountFactor');
  const discountFactorLibrary = await DiscountFactor.deploy();
  await discountFactorLibrary.deployed();

  // Call callback functions for mocking
  const instances = {};
  for (const [name, callback] of Object.entries(mockCallbacks)) {
    instances[name] = await callback({
      dealIdLibrary,
      quickSortLibrary,
      discountFactorLibrary,
    });
  }

  // Deploy contracts
  const addressResolver =
    instances['AddressResolver'] || (await AddressResolver.new());
  const closeOutNetting = await CloseOutNetting.new(addressResolver.address);
  const collateralAggregator =
    instances['CollateralAggregator'] ||
    (await CollateralAggregatorV2.new(addressResolver.address));

  const crosschainAddressResolver = await CrosschainAddressResolver.new(
    addressResolver.address,
  );
  const currencyController =
    instances['CurrencyController'] || (await CurrencyController.new());
  const liquidations =
    instances['Liquidations'] ||
    (await Liquidations.new(addressResolver.address, 10));
  const markToMarket =
    instances['MarkToMarket'] ||
    (await MarkToMarket.new(addressResolver.address));
  const paymentAggregator =
    instances['PaymentAggregator'] ||
    (await PaymentAggregator.new(addressResolver.address));

  const wETHToken = await WETH9Mock.new();

  const productAddressResolver =
    instances['ProductAddressResolver'] ||
    (await ethers
      .getContractFactory('ProductAddressResolver', {
        libraries: {
          DealId: dealIdLibrary.address,
        },
      })
      .then((factory) => factory.deploy()));

  const termStructure =
    instances['TermStructure'] ||
    (await ethers
      .getContractFactory('TermStructure', {
        libraries: {
          QuickSort: quickSortLibrary.address,
        },
      })
      .then((factory) => factory.deploy(addressResolver.address)));
  const loan =
    instances['Loan'] ||
    (await ethers
      .getContractFactory('LoanV2', {
        libraries: {
          DealId: dealIdLibrary.address,
          DiscountFactor: discountFactorLibrary.address,
        },
      })
      .then((factory) => factory.deploy(addressResolver.address)));

  const settlementEngine =
    instances['SettlementEngine'] ||
    (await ethers
      .getContractFactory('SettlementEngine')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      ));

  const lendingMarketController =
    instances['LendingMarketController'] ||
    (await ethers
      .getContractFactory('LendingMarketController', {
        libraries: {
          QuickSort: quickSortLibrary.address,
          DiscountFactor: discountFactorLibrary.address,
        },
      })
      .then((factory) => factory.deploy(addressResolver.address)));

  // Set up for CurrencyController
  const btcToETHPriceFeed = await MockV3Aggregator.new(
    18,
    hexBTCString,
    btcToETHRate,
  );
  const ethToUSDPriceFeed = await MockV3Aggregator.new(
    8,
    hexETHString,
    ethToUSDRate,
  );
  const filToETHPriceFeed = await MockV3Aggregator.new(
    18,
    hexFILString,
    filToETHRate,
  );

  await currencyController.supportCurrency(
    hexBTCString,
    'Bitcoin',
    0,
    btcToETHPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyController.supportCurrency(
    hexETHString,
    'Ethereum',
    60,
    ethToUSDPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyController.supportCurrency(
    hexFILString,
    'Filecoin',
    461,
    filToETHPriceFeed.address,
    7500,
    zeroAddress,
  );

  await currencyController.updateCollateralSupport(hexETHString, true);
  await currencyController.updateCollateralSupport(hexFILString, true);
  await currencyController.updateMinMargin(hexETHString, 2500);

  // Set up for ProductAddressResolver
  await productAddressResolver.registerProduct(
    loanPrefix,
    loan.address,
    lendingMarketController.address,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationAddressResolver = await MigrationAddressResolver.new();
  const migrationTargets = [
    ['CloseOutNetting', closeOutNetting],
    ['CollateralAggregator', collateralAggregator],
    ['CrosschainAddressResolver', crosschainAddressResolver],
    ['CurrencyController', currencyController],
    ['MarkToMarket', markToMarket],
    ['LendingMarketController', lendingMarketController],
    ['Liquidations', liquidations],
    ['PaymentAggregator', paymentAggregator],
    ['ProductAddressResolver', productAddressResolver],
    ['SettlementEngine', settlementEngine],
    ['TermStructure', termStructure],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) => toBytes32(name)),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  const buildCachesAddresses = [
    closeOutNetting,
    collateralAggregator,
    crosschainAddressResolver,
    markToMarket,
    lendingMarketController,
    liquidations,
    loan,
    paymentAggregator,
    settlementEngine,
    termStructure,
  ]
    .filter((contract) => !!contract.buildCache) // exclude contracts that doesn't have buildCache method such as mock
    .map((contract) => contract.address);

  await addressResolver.importAddresses(
    importAddressesArgs.names,
    importAddressesArgs.addresses,
  );
  await migrationAddressResolver.buildCaches(buildCachesAddresses);

  return {
    // libraries
    dealIdLibrary,
    quickSortLibrary,
    discountFactorLibrary,
    // contracts
    addressResolver,
    closeOutNetting,
    collateralAggregator,
    crosschainAddressResolver,
    currencyController,
    lendingMarketController,
    liquidations,
    loan,
    markToMarket,
    productAddressResolver,
    paymentAggregator,
    settlementEngine,
    termStructure,
    wETHToken,
    // mocks
    btcToETHPriceFeed,
    ethToUSDPriceFeed,
    filToETHPriceFeed,
  };
};

class Deployment {
  #mockCallbacks = {};

  mock(name) {
    return {
      useValue: this._useValue(name),
      useFactory: this._useFactory(name),
    };
  }

  _useValue(name) {
    return (value) => (this.#mockCallbacks[name] = () => value);
  }

  _useFactory(name) {
    return (key, callback) => {
      const deploy = (...args) => {
        const newCallback = async (libraries) => {
          const newLibraries = callback(libraries);
          return ethers
            .getContractFactory(key, { libraries: newLibraries })
            .then((factory) => factory.deploy(...args));
        };
        this.#mockCallbacks[name] = newCallback;
      };
      return { deploy };
    };
  }

  execute() {
    return deployContracts(this.#mockCallbacks);
  }
}

module.exports = { Deployment };
