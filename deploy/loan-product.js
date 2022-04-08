const { loanPrefix } = require('../test-utils').strings;
const { hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const discountFactorLibrary = await deployments.get('DiscountFactor');
  const quickSortLibrary = await deployments.get('QuickSort');
  const currencyController = await deployments.get('CurrencyController');

  const termStructure = await deployments.get('TermStructure');
  const termStructureContract = await ethers.getContractAt(
    'TermStructure',
    termStructure.address,
  );

  const productResolver = await deployments.get('ProductAddressResolver');
  const productResolverContract = await ethers.getContractAt(
    'ProductAddressResolver',
    productResolver.address,
  );

  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const collateralContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );

  const liquidations = await deployments.get('Liquidations');
  const liquidationsContract = await ethers.getContractAt(
    'Liquidations',
    liquidations.address,
  );

  const paymentAggregator = await deployments.get('PaymentAggregator');
  const paymentAggregatorContract = await ethers.getContractAt(
    'PaymentAggregator',
    paymentAggregator.address,
  );

  const loanV2 = await deploy('LoanV2', {
    from: deployer,
    libraries: {
      DiscountFactor: discountFactorLibrary.address,
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed LoanV2 at ' + loanV2.address);

  const loanV2Contract = await ethers.getContractAt('LoanV2', loanV2.address);

  await (
    await paymentAggregatorContract.addPaymentAggregatorUser(loanV2.address)
  ).wait();
  await (
    await loanV2Contract.setCollateralAddr(collateralAggregator.address)
  ).wait();
  await (await loanV2Contract.setTermStructure(termStructure.address)).wait();
  await (
    await loanV2Contract.setPaymentAggregator(paymentAggregator.address)
  ).wait();
  await (await loanV2Contract.setLiquidations(liquidations.address)).wait();

  const lendingController = await deploy('LendingMarketController', {
    from: deployer,
    libraries: {
      QuickSort: quickSortLibrary.address,
      DiscountFactor: discountFactorLibrary.address,
    },
  });
  const lendingControllerContract = await ethers.getContractAt(
    'LendingMarketController',
    lendingController.address,
  );
  console.log(
    'Deployed LendingMarketController at ' + lendingController.address,
  );

  await (
    await productResolverContract.registerProduct(
      loanPrefix,
      loanV2.address,
      lendingControllerContract.address,
      { from: deployer },
    )
  ).wait();

  for (i = 0; i < sortedTermDays.length; i++) {
    await (
      await termStructureContract.supportTerm(
        sortedTermDays[i],
        [loanPrefix],
        [hexFILString, hexBTCString, hexETHString],
      )
    ).wait();
  }

  await (
    await lendingControllerContract.setCurrencyController(
      currencyController.address,
      { from: deployer },
    )
  ).wait();
  await (
    await lendingControllerContract.setTermStructure(termStructure.address)
  ).wait();
  await (
    await loanV2Contract.setLendingControllerAddr(lendingController.address, {
      from: deployer,
    })
  ).wait();
  await (
    await collateralContract.addCollateralUser(loanV2.address, {
      from: deployer,
    })
  ).wait();
  await (
    await liquidationsContract.linkContract(loanV2.address, { from: deployer })
  ).wait();
};

module.exports.tags = ['LoanProduct'];
module.exports.dependencies = [
  'Libraries',
  'ProductAddressResolver',
  'CurrencyController',
  'TermStructure',
  'CollateralAggregator',
  'Liquidations',
];
