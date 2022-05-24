const AddressResolver = artifacts.require('AddressResolver');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const CurrencyController = artifacts.require('CurrencyController');
const CrosschainAddressResolver = artifacts.require(
  'CrosschainAddressResolver',
);
const MarkToMarket = artifacts.require('MarkToMarket');
const PaymentAggregator = artifacts.require('PaymentAggregator');
const WETH9Mock = artifacts.require('WETH9Mock');

const { ethers } = require('hardhat');
const bytes32 = require('bytes32');

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
  const productAddressResolver =
    instances['ProductAddressResolver'] ||
    (await ethers
      .getContractFactory('ProductAddressResolver', {
        libraries: {
          DealId: dealIdLibrary.address,
        },
      })
      .then((factory) => factory.deploy()));
  const markToMarket =
    instances['MarkToMarket'] ||
    (await MarkToMarket.new(productAddressResolver.address));
  const paymentAggregator =
    instances['PaymentAggregator'] ||
    (await PaymentAggregator.new(addressResolver.address));
  const closeOutNetting = await CloseOutNetting.new(addressResolver.address);
  const collateralAggregator =
    instances['CollateralAggregator'] || (await CollateralAggregatorV2.new());
  const currencyController =
    instances['CurrencyController'] || (await CurrencyController.new());
  const crosschainAddressResolver = await CrosschainAddressResolver.new(
    collateralAggregator.address,
  );
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

  const wETHToken = await WETH9Mock.new();
  const settlementEngine = await ethers
    .getContractFactory('SettlementEngine')
    .then((factory) =>
      factory.deploy(addressResolver.address, wETHToken.address),
    );

  // Settings for Loan
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

  loan.setLendingMarketControllerAddr &&
    (await loan.setLendingMarketControllerAddr(
      lendingMarketController.address,
    ));

  // Settings for AddressResolver
  await addressResolver.importAddresses(
    [
      'CloseOutNetting',
      'CollateralAggregator',
      'CrosschainAddressResolver',
      'CurrencyController',
      'MarkToMarket',
      'Loan',
      'PaymentAggregator',
      'ProductAddressResolver',
      'SettlementEngine',
      'TermStructure',
    ].map((input) => bytes32({ input })),
    [
      closeOutNetting.address,
      collateralAggregator.address,
      crosschainAddressResolver.address,
      currencyController.address,
      markToMarket.address,
      loan.address,
      paymentAggregator.address,
      productAddressResolver.address,
      settlementEngine.address,
      termStructure.address,
    ],
  );

  paymentAggregator.buildCache && (await paymentAggregator.buildCache());
  closeOutNetting.buildCache && (await closeOutNetting.buildCache());
  settlementEngine.buildCache && (await settlementEngine.buildCache());
  termStructure.buildCache && (await termStructure.buildCache());
  loan.buildCache && (await loan.buildCache());

  return {
    dealIdLibrary,
    quickSortLibrary,
    discountFactorLibrary,
    productAddressResolver,
    addressResolver,
    markToMarket,
    paymentAggregator,
    closeOutNetting,
    collateralAggregator,
    currencyController,
    crosschainAddressResolver,
    termStructure,
    lendingMarketController,
    loan,
    wETHToken,
    settlementEngine,
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
