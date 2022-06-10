const btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
const filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

const { toBytes32, loanPrefix, hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get deployments
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const getProxy = (key, contract) =>
    proxyController
      .getProxyAddress(toBytes32(key))
      .then((address) => ethers.getContractAt(contract || key, address));

  // Get contracts from proxyController
  const closeOutNetting = await getProxy('CloseOutNetting');
  const collateralAggregator = await getProxy(
    'CollateralAggregator',
    'CollateralAggregatorV2',
  );
  const crosschainAddressResolver = await getProxy('CrosschainAddressResolver');
  const currencyController = await getProxy('CurrencyController');
  const markToMarket = await getProxy('MarkToMarket');
  const lendingMarketController = await getProxy('LendingMarketController');
  const liquidations = await getProxy('Liquidations');
  const paymentAggregator = await getProxy('PaymentAggregator');
  const productAddressResolver = await getProxy('ProductAddressResolver');
  const settlementEngine = await getProxy('SettlementEngine');
  const termStructure = await getProxy('TermStructure');

  // Get deployed contracts
  const addressResolver = await deployments
    .get('AddressResolver')
    .then(({ address }) => ethers.getContractAt('AddressResolver', address));

  const loan = await deployments
    .get('LoanV2')
    .then(({ address }) => ethers.getContractAt('LoanV2', address));

  // Deploy contracts
  const migrationAddressResolver = await deploy('MigrationAddressResolver', {
    from: deployer,
  }).then(({ address }) =>
    ethers.getContractAt('MigrationAddressResolver', address),
  );

  console.log(
    'Deployed MigrationAddressResolver at ' + migrationAddressResolver.address,
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

  const contractAddresses = [
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

  await addressResolver
    .importAddresses(contractNames, contractAddresses)
    .then((tx) => tx.wait());

  await migrationAddressResolver
    .buildCaches(buildCachesAddresses)
    .then((tx) => tx.wait());

  // Set up for CollateralAggregator

  await collateralAggregator.functions['register(string[],uint256[])'](
    [btcAddress, filAddress],
    [0, 461],
  ).then((tx) => tx.wait());

  // Set up for ProductAddressResolver
  await productAddressResolver
    .registerProduct(loanPrefix, loan.address, lendingMarketController.address)
    .then((tx) => tx.wait());

  // Set up for TermStructure
  for (i = 0; i < sortedTermDays.length; i++) {
    await termStructure
      .supportTerm(
        sortedTermDays[i],
        [loanPrefix],
        [hexFILString, hexBTCString, hexETHString],
      )
      .then((tx) => tx.wait());
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
