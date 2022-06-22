const AddressResolver = artifacts.require('AddressResolver');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const CollateralVault = artifacts.require('CollateralVault');
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

const deployContracts = async (mockCallbacks, mockContractNames) => {
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
  const closeOutNetting =
    instances['CloseOutNetting'] || (await CloseOutNetting.new());
  const collateralAggregator =
    instances['CollateralAggregator'] || (await CollateralAggregatorV2.new());
  const collateralVault =
    instances['CollateralVault'] || (await CollateralVault.new());
  const crosschainAddressResolver =
    instances['CrosschainAddressResolver'] ||
    (await CrosschainAddressResolver.new());
  const currencyController =
    instances['CurrencyController'] || (await CurrencyController.new());
  const liquidations = instances['Liquidations'] || (await Liquidations.new());
  const markToMarket = instances['MarkToMarket'] || (await MarkToMarket.new());
  const paymentAggregator =
    instances['PaymentAggregator'] || (await PaymentAggregator.new());

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
      .then((factory) => factory.deploy()));
  const loan =
    instances['Loan'] ||
    (await ethers
      .getContractFactory('LoanV2', {
        libraries: {
          DealId: dealIdLibrary.address,
          DiscountFactor: discountFactorLibrary.address,
        },
      })
      .then((factory) => factory.deploy()));

  const settlementEngine =
    instances['SettlementEngine'] ||
    (await ethers
      .getContractFactory('SettlementEngine')
      .then((factory) => factory.deploy()));

  const lendingMarketController =
    instances['LendingMarketController'] ||
    (await ethers
      .getContractFactory('LendingMarketController', {
        libraries: {
          QuickSort: quickSortLibrary.address,
          DiscountFactor: discountFactorLibrary.address,
        },
      })
      .then((factory) => factory.deploy()));

  const proxyController =
    instances['ProxyController'] ||
    (await ProxyController.new(ethers.constants.AddressZero));

  // Get the Proxy contract address of AddressResolver
  await proxyController.setAddressResolverImpl(addressResolver.address);
  const addressResolverProxyAddress =
    await proxyController.getAddressResolverProxyAddress();

  // Deploy MigrationAddressResolver
  const migrationAddressResolver = await MigrationAddressResolver.new(
    addressResolverProxyAddress,
  );

  // Set contract addresses to the Proxy contract
  const [
    closeOutNettingAddress,
    collateralAggregatorAddress,
    collateralVaultAddress,
    crosschainAddressResolverAddress,
    currencyControllerAddress,
    lendingMarketControllerAddress,
    liquidationsAddress,
    markToMarketAddress,
    paymentAggregatorAddress,
    productAddressResolverAddress,
    settlementEngineAddress,
    termStructureAddress,
    loanAddress,
  ] = await Promise.all([
    proxyController.setCloseOutNettingImpl(closeOutNetting.address),
    proxyController.setCollateralAggregatorImpl(collateralAggregator.address),
    proxyController.setCollateralVaultImpl(
      collateralVault.address,
      wETHToken.address,
    ),
    proxyController.setCrosschainAddressResolverImpl(
      crosschainAddressResolver.address,
    ),
    proxyController.setCurrencyControllerImpl(currencyController.address),
    proxyController.setLendingMarketControllerImpl(
      lendingMarketController.address,
    ),
    proxyController.setLiquidationsImpl(liquidations.address, 10),
    proxyController.setMarkToMarketImpl(markToMarket.address),
    proxyController.setPaymentAggregatorImpl(paymentAggregator.address),
    proxyController.setProductAddressResolverImpl(
      productAddressResolver.address,
    ),
    proxyController.setSettlementEngineImpl(
      settlementEngine.address,
      wETHToken.address,
    ),
    proxyController.setTermStructureImpl(termStructure.address),
    proxyController.setLoanImpl(loan.address),
  ]).then((txs) =>
    txs.map(
      ({ logs }) =>
        logs.find(({ event }) => event === 'ProxyCreated').args.proxyAddress,
    ),
  );

  // Get the Proxy contract addresses
  const addressResolverProxy = await AddressResolver.at(
    addressResolverProxyAddress,
  );
  const closeOutNettingProxy = await CloseOutNetting.at(closeOutNettingAddress);
  const collateralAggregatorProxy = await CollateralAggregatorV2.at(
    collateralAggregatorAddress,
  );
  const collateralVaultProxy = await ethers.getContractAt(
    mockContractNames['CollateralVault'] || 'CollateralVault',
    collateralVaultAddress,
  );
  const crosschainAddressResolverProxy = await CrosschainAddressResolver.at(
    crosschainAddressResolverAddress,
  );
  const currencyControllerProxy = await CurrencyController.at(
    currencyControllerAddress,
  );
  const lendingMarketControllerProxy = await ethers.getContractAt(
    mockContractNames['LendingMarketController'] || 'LendingMarketController',
    lendingMarketControllerAddress,
  );
  const liquidationsProxy = await Liquidations.at(liquidationsAddress);
  const markToMarketProxy = await MarkToMarket.at(markToMarketAddress);
  const paymentAggregatorProxy = await PaymentAggregator.at(
    paymentAggregatorAddress,
  );
  const productAddressResolverProxy = await ethers.getContractAt(
    mockContractNames['ProductAddressResolver'] || 'ProductAddressResolver',
    productAddressResolverAddress,
  );
  const settlementEngineProxy = await ethers.getContractAt(
    mockContractNames['SettlementEngine'] || 'SettlementEngine',
    settlementEngineAddress,
  );
  const termStructureProxy = await ethers.getContractAt(
    mockContractNames['TermStructure'] || 'TermStructure',
    termStructureAddress,
  );
  const loanProxy = await ethers.getContractAt(
    mockContractNames['Loan'] || 'LoanV2',
    loanAddress,
  );

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
    loanProxy.address,
    lendingMarketControllerProxy.address,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets = [
    ['CloseOutNetting', closeOutNettingProxy],
    ['CollateralAggregator', collateralAggregatorProxy],
    ['CollateralVault', collateralVaultProxy],
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
    collateralVaultProxy,
    crosschainAddressResolverProxy,
    markToMarketProxy,
    lendingMarketControllerProxy,
    liquidationsProxy,
    loanProxy,
    paymentAggregatorProxy,
    settlementEngineProxy,
    termStructureProxy,
  ]
    .filter((contract) => !!contract.buildCache) // exclude contracts that doesn't have buildCache method such as mock
    .map((contract) => contract.address);

  await addressResolverProxy.importAddresses(
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
    addressResolver: addressResolverProxy,
    closeOutNetting: closeOutNettingProxy,
    collateralAggregator: collateralAggregatorProxy,
    collateralVault: collateralVaultProxy,
    crosschainAddressResolver: crosschainAddressResolverProxy,
    currencyController: currencyControllerProxy,
    lendingMarketController: lendingMarketControllerProxy,
    liquidations: liquidationsProxy,
    loan: loanProxy,
    markToMarket: markToMarketProxy,
    paymentAggregator: paymentAggregatorProxy,
    productAddressResolver: productAddressResolverProxy,
    proxyController,
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
  #mockContractNames = {};

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
        this.#mockContractNames[name] = key;
      };
      return { deploy };
    };
  }

  execute() {
    return deployContracts(this.#mockCallbacks, this.#mockContractNames);
  }
}

const executeIfNewlyDeployment = async (name, deployResult, callback) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);

    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

module.exports = { Deployment, executeIfNewlyDeployment };
