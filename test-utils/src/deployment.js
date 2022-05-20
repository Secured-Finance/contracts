const AddressResolver = artifacts.require('AddressResolver');
const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const MarkToMarket = artifacts.require('MarkToMarket');
const CurrencyController = artifacts.require('CurrencyController');
const PaymentAggregator = artifacts.require('PaymentAggregator');
const CloseOutNetting = artifacts.require('CloseOutNetting');

const { ethers } = require('hardhat');
const bytes32 = require('bytes32');

const deploy = async (instances = {}) => {
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

  // Deploy contracts
  const productResolver = await ethers
    .getContractFactory('ProductAddressResolver', {
      libraries: {
        DealId: dealIdLibrary.address,
      },
    })
    .then((factory) => factory.deploy());
  const addressResolver =
    instances['AddressResolver'] || (await AddressResolver.new());
  const markToMarket =
    instances['MarkToMarket'] ||
    (await MarkToMarket.new(productResolver.address));
  const paymentAggregator =
    instances['PaymentAggregator'] ||
    (await PaymentAggregator.new(addressResolver.address));
  const closeOutNetting = await CloseOutNetting.new(addressResolver.address);
  const collateral = await CollateralAggregatorV2.new();
  const currencyController = await CurrencyController.new();
  const termStructure = await ethers
    .getContractFactory('TermStructure', {
      libraries: {
        QuickSort: quickSortLibrary.address,
      },
    })
    .then((factory) =>
      factory.deploy(currencyController.address, productResolver.address),
    );
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

  // Settings for AddressResolver
  await addressResolver.importAddresses(
    [
      'CollateralAggregator',
      'CloseOutNetting',
      'MarkToMarket',
      'Loan',
      'PaymentAggregator',
    ].map((input) => bytes32({ input })),
    [
      collateral.address,
      closeOutNetting.address,
      markToMarket.address,
      loan.address,
      paymentAggregator.address,
    ],
  );

  paymentAggregator.buildCache && (await paymentAggregator.buildCache());
  closeOutNetting.buildCache && (await closeOutNetting.buildCache());

  return {
    dealIdLibrary,
    quickSortLibrary,
    discountFactorLibrary,
    productResolver,
    addressResolver,
    markToMarket,
    paymentAggregator,
    closeOutNetting,
    collateral,
    currencyController,
    termStructure,
    loan,
  };
};

class Deployment {
  #instances = {};

  async mock(name, callback) {
    this.#instances[name] = await callback();
  }

  execute() {
    return deploy(this.#instances);
  }
}

module.exports = { Deployment };
