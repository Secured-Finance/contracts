const btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
const filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

const { toBytes32, loanPrefix, hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get deployments
  const addressResolver = await deployments.get('AddressResolver');
  const closeOutNetting = await deployments.get('CloseOutNetting');
  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const crosschainAddressResolver = await deployments.get(
    'CrosschainAddressResolver',
  );
  const currencyController = await deployments.get('CurrencyController');
  const markToMarket = await deployments.get('MarkToMarket');
  const lendingMarketController = await deployments.get(
    'LendingMarketController',
  );
  const liquidations = await deployments.get('Liquidations');
  const loan = await deployments.get('LoanV2');
  const paymentAggregator = await deployments.get('PaymentAggregator');
  const productAddressResolver = await deployments.get(
    'ProductAddressResolver',
  );
  const settlementEngine = await deployments.get('SettlementEngine');
  const termStructure = await deployments.get('TermStructure');

  // Get Contracts
  const addressResolverContract = await ethers.getContractAt(
    'AddressResolver',
    addressResolver.address,
  );
  const collateralAggregatorContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );
  const termStructureContract = await ethers.getContractAt(
    'TermStructure',
    termStructure.address,
  );

  // Deploy contracts
  const migrationAddressResolver = await deploy('MigrationAddressResolver', {
    from: deployer,
  });

  console.log(
    'Deployed MigrationAddressResolver at ' + migrationAddressResolver.address,
  );

  const migrationAddressResolverContract = await ethers.getContractAt(
    'MigrationAddressResolver',
    migrationAddressResolver.address,
  );

  // Set up for AddressResolver
  const contractNames = [
    'CloseOutNetting',
    'CollateralAggregator',
    'CrosschainAddressResolver',
    'CurrencyController',
    'MarkToMarket',
    'LendingMarketController',
    'Liquidations',
    'PaymentAggregator',
    'ProductAddressResolver',
    'SettlementEngine',
    'TermStructure',
  ].map(toBytes32);
  const contracAddresses = [
    closeOutNetting.address,
    collateralAggregator.address,
    crosschainAddressResolver.address,
    currencyController.address,
    markToMarket.address,
    lendingMarketController.address,
    liquidations.address,
    paymentAggregator.address,
    productAddressResolver.address,
    settlementEngine.address,
    termStructure.address,
  ];

  const buildCachesAddresses = [
    closeOutNetting.address,
    collateralAggregator.address,
    crosschainAddressResolver.address,
    markToMarket.address,
    lendingMarketController.address,
    liquidations.address,
    loan.address,
    paymentAggregator.address,
    settlementEngine.address,
    termStructure.address,
  ];

  await (
    await addressResolverContract.importAddresses(
      contractNames,
      contracAddresses,
    )
  ).wait();
  await (
    await migrationAddressResolverContract.buildCaches(buildCachesAddresses)
  ).wait();

  // Set up for CollateralAggregator
  await (
    await collateralAggregatorContract.functions[
      'register(string[],uint256[])'
    ]([btcAddress, filAddress], [0, 461])
  ).wait();

  // Set up for TermStructure
  for (i = 0; i < sortedTermDays.length; i++) {
    await (
      await termStructureContract.supportTerm(
        sortedTermDays[i],
        [loanPrefix],
        [hexFILString, hexBTCString, hexETHString],
      )
    ).wait();
  }
};

module.exports.tags = ['Migration'];
module.exports.dependencies = [
  'CloseOutNetting',
  'CollateralAggregator',
  'CrosschainAddressResolver',
  'CurrencyController',
  'MarkToMarket',
  'LendingMarketController',
  'Liquidations',
  'Loan',
  'PaymentAggregator',
  'ProductAddressResolver',
  'SettlementEngine',
  'TermStructure',
];
