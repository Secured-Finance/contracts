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
const ProxyController = artifacts.require('ProxyController');
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
  const closeOutNetting = await CloseOutNetting.new();
  const collateralAggregator = await CollateralAggregatorV2.new();
  const crosschainAddressResolver = await CrosschainAddressResolver.new();
  const currencyController = await CurrencyController.new();
  const liquidations = await Liquidations.new();
  const markToMarket = await MarkToMarket.new();
  const paymentAggregator = await PaymentAggregator.new();

  const wETHToken = await WETH9Mock.new();

  const productAddressResolver = await ethers
    .getContractFactory('ProductAddressResolver', {
      libraries: {
        DealId: dealIdLibrary.address,
      },
    })
    .then((factory) => factory.deploy());

  const termStructure = await ethers
    .getContractFactory('TermStructure', {
      libraries: {
        QuickSort: quickSortLibrary.address,
      },
    })
    .then((factory) => factory.deploy());
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

  const settlementEngine = await ethers
    .getContractFactory('SettlementEngine')
    .then((factory) => factory.deploy());

  const lendingMarketController = await ethers
    .getContractFactory('LendingMarketController', {
      libraries: {
        QuickSort: quickSortLibrary.address,
        DiscountFactor: discountFactorLibrary.address,
      },
    })
    .then((factory) => factory.deploy());

  const proxyController = await ProxyController.new(addressResolver.address);
  const migrationAddressResolver = await MigrationAddressResolver.new(
    addressResolver.address,
  );

  // Set contract addresses to the Proxy contract
  await proxyController.setCloseOutNettingImpl(closeOutNetting.address);
  await proxyController.setCollateralAggregatorImpl(
    collateralAggregator.address,
  );
  await proxyController.setCrosschainAddressResolverImpl(
    crosschainAddressResolver.address,
  );
  await proxyController.setCurrencyControllerImpl(currencyController.address);
  await proxyController.setLendingMarketControllerImpl(
    lendingMarketController.address,
  );
  await proxyController.setLiquidationsImpl(liquidations.address, 10);
  await proxyController.setMarkToMarketImpl(markToMarket.address);
  await proxyController.setPaymentAggregatorImpl(paymentAggregator.address);
  await proxyController.setProductAddressResolverImpl(
    productAddressResolver.address,
  );
  await proxyController.setSettlementEngineImpl(
    settlementEngine.address,
    wETHToken.address,
  );
  await proxyController.setTermStructureImpl(termStructure.address);

  // Get the Proxy contract addresses
  const closeOutNettingProxy =
    instances['CloseOutNetting'] ||
    (await proxyController
      .getProxyAddress(toBytes32('CloseOutNetting'))
      .then((address) => CloseOutNetting.at(address)));

  const collateralAggregatorProxy =
    instances['CollateralAggregator'] ||
    (await proxyController
      .getProxyAddress(toBytes32('CollateralAggregator'))
      .then((address) => CollateralAggregatorV2.at(address)));

  const crosschainAddressResolverProxy =
    instances['CrosschainAddressResolver'] ||
    (await proxyController
      .getProxyAddress(toBytes32('CrosschainAddressResolver'))
      .then((address) => CrosschainAddressResolver.at(address)));

  const currencyControllerProxy =
    instances['CurrencyController'] ||
    (await proxyController
      .getProxyAddress(toBytes32('CurrencyController'))
      .then((address) => CurrencyController.at(address)));

  const lendingMarketControllerProxy =
    instances['LendingMarketController'] ||
    (await proxyController
      .getProxyAddress(toBytes32('LendingMarketController'))
      .then((address) =>
        ethers.getContractAt('LendingMarketController', address),
      ));

  const liquidationsProxy =
    instances['Liquidations'] ||
    (await proxyController
      .getProxyAddress(toBytes32('Liquidations'))
      .then((address) => Liquidations.at(address)));

  const markToMarketProxy =
    instances['MarkToMarket'] ||
    (await proxyController
      .getProxyAddress(toBytes32('MarkToMarket'))
      .then((address) => MarkToMarket.at(address)));

  const paymentAggregatorProxy =
    instances['PaymentAggregator'] ||
    (await proxyController
      .getProxyAddress(toBytes32('PaymentAggregator'))
      .then((address) => PaymentAggregator.at(address)));

  const productAddressResolverProxy =
    instances['ProductAddressResolver'] ||
    (await proxyController
      .getProxyAddress(toBytes32('ProductAddressResolver'))
      .then((address) =>
        ethers.getContractAt('ProductAddressResolver', address),
      ));

  const settlementEngineProxy =
    instances['SettlementEngine'] ||
    (await proxyController
      .getProxyAddress(toBytes32('SettlementEngine'))
      .then((address) => ethers.getContractAt('SettlementEngine', address)));

  const termStructureProxy =
    instances['TermStructure'] ||
    (await proxyController
      .getProxyAddress(toBytes32('TermStructure'))
      .then((address) => ethers.getContractAt('TermStructure', address)));

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

  await currencyControllerProxy.supportCurrency(
    hexBTCString,
    'Bitcoin',
    0,
    btcToETHPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexETHString,
    'Ethereum',
    60,
    ethToUSDPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexFILString,
    'Filecoin',
    461,
    filToETHPriceFeed.address,
    7500,
    zeroAddress,
  );

  await currencyControllerProxy.updateCollateralSupport(hexETHString, true);
  await currencyControllerProxy.updateCollateralSupport(hexFILString, true);
  await currencyControllerProxy.updateMinMargin(hexETHString, 2500);

  // Set up for ProductAddressResolver
  await productAddressResolverProxy.registerProduct(
    loanPrefix,
    loan.address,
    lendingMarketControllerProxy.address,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets = [
    ['CloseOutNetting', closeOutNettingProxy],
    ['CollateralAggregator', collateralAggregatorProxy],
    ['CrosschainAddressResolver', crosschainAddressResolverProxy],
    ['CurrencyController', currencyControllerProxy],
    ['MarkToMarket', markToMarketProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
    ['Liquidations', liquidationsProxy],
    ['PaymentAggregator', paymentAggregatorProxy],
    ['ProductAddressResolver', productAddressResolverProxy],
    ['SettlementEngine', settlementEngineProxy],
    ['TermStructure', termStructureProxy],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) => toBytes32(name)),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  const buildCachesAddresses = [
    closeOutNettingProxy,
    collateralAggregatorProxy,
    crosschainAddressResolverProxy,
    markToMarketProxy,
    lendingMarketControllerProxy,
    liquidationsProxy,
    loan,
    paymentAggregatorProxy,
    settlementEngineProxy,
    termStructureProxy,
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
    closeOutNetting: closeOutNettingProxy,
    collateralAggregator: collateralAggregatorProxy,
    crosschainAddressResolver: crosschainAddressResolverProxy,
    currencyController: currencyControllerProxy,
    lendingMarketController: lendingMarketControllerProxy,
    liquidations: liquidationsProxy,
    loan,
    markToMarket: markToMarketProxy,
    paymentAggregator: paymentAggregatorProxy,
    productAddressResolver: productAddressResolverProxy,
    settlementEngine: settlementEngineProxy,
    termStructure: termStructureProxy,
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
