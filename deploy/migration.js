const btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
const filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

const { toBytes32, loanPrefix, hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get deployments
  const wETHToken = await deployments.get('WETH9Mock');
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  // Deploy contracts
  const prevMigrationAddressResolver = await deployments.getOrNull(
    'MigrationAddressResolver',
  );
  const isInitialDeployment = !prevMigrationAddressResolver;
  const migrationAddressResolver = await deploy('MigrationAddressResolver', {
    from: deployer,
  }).then(({ address }) =>
    ethers.getContractAt('MigrationAddressResolver', address),
  );

  // Get contracts from proxyController
  const filter = proxyController.filters.ProxyCreated();
  const proxyCreatedEvents = await proxyController.queryFilter(filter);
  const proxyObj = proxyCreatedEvents.reduce((obj, event) => {
    obj[event.args.id] = event.args.proxyAddress;
    return obj;
  }, {});

  const getProxy = async (key, contract) => {
    let address = proxyObj[toBytes32(key)];
    // When ProxyController is updated, proxyObj is empty because new contract doesn't have old events.
    // So in that case, the registered contract address is got from AddressResolver through ProxyController.
    if (!address) {
      address = await proxyController.getAddress(toBytes32(key));
    }
    return ethers.getContractAt(contract || key, address);
  };

  const closeOutNetting = await getProxy('CloseOutNetting');
  const collateralAggregator = await getProxy(
    'CollateralAggregator',
    'CollateralAggregatorV2',
  );
  const collateralVault = await getProxy('CollateralVault');
  const crosschainAddressResolver = await getProxy('CrosschainAddressResolver');
  const currencyController = await getProxy('CurrencyController');
  const markToMarket = await getProxy('MarkToMarket');
  const lendingMarketController = await getProxy('LendingMarketController');
  const liquidations = await getProxy('Liquidations');
  const paymentAggregator = await getProxy('PaymentAggregator');
  const productAddressResolver = await getProxy('ProductAddressResolver');
  const settlementEngine = await getProxy('SettlementEngine');
  const termStructure = await getProxy('TermStructure');

  const loanAddress =
    proxyObj[loanPrefix.padEnd(66, 0)] ||
    (await proxyController.getProductAddress(loanPrefix));
  const loan = await ethers.getContractAt('LoanV2', loanAddress);

  // Get deployed contracts
  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  const contractNames = [
    'CloseOutNetting',
    'CollateralAggregator',
    'CollateralVault',
    'CrosschainAddressResolver',
    'CurrencyController',
    'MarkToMarket',
    'LendingMarketController',
    'Liquidations',
    'PaymentAggregator',
    'ProductAddressResolver',
    'SettlementEngine',
    'TermStructure',
  ];

  const contractAddresses = [
    closeOutNetting.address,
    collateralAggregator.address,
    collateralVault.address,
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
    collateralVault.address,
    crosschainAddressResolver.address,
    markToMarket.address,
    lendingMarketController.address,
    liquidations.address,
    loan.address,
    paymentAggregator.address,
    settlementEngine.address,
    termStructure.address,
  ];

  // show log
  const logHeader = 'Proxy Addresses';
  const log = { AddressResolver: { [logHeader]: addressResolver.address } };
  contractNames.forEach((name, idx) => {
    log[name] = { [logHeader]: contractAddresses[idx] };
  });
  console.table(log);

  if (!isInitialDeployment) {
    console.warn('Skipped migration settings');
    return;
  }

  // Set up for AddressResolver
  await addressResolver
    .importAddresses(contractNames.map(toBytes32), contractAddresses)
    .then((tx) => tx.wait());
  console.log('Successfully imported Addresses into AddressResolver');

  await migrationAddressResolver
    .buildCaches(buildCachesAddresses)
    .then((tx) => tx.wait());
  console.log('Successfully built address caches');

  // Set up for CollateralAggregator
  await collateralAggregator.functions['register(string[],uint256[])'](
    [btcAddress, filAddress],
    [0, 461],
  ).then((tx) => tx.wait());
  console.log('Successfully registered the currency data');

  // Set up for CollateralVault
  await collateralVault.registerCurrency(hexETHString, wETHToken.address);
  console.log('Successfully registered the currency as supported collateral');

  // TODO: Move this step to the test script on the forked chain
  // await collateralVault.functions['deposit(bytes32,uint256)'](
  //   hexETHString,
  //   '10000000000000000',
  //   {
  //     value: '10000000000000000',
  //   },
  // ).then((tx) => tx.wait());
  // console.log('Successfully deposited ETH for testing');

  // Set up for ProductAddressResolver
  await productAddressResolver
    .registerProduct(loanPrefix, loan.address, lendingMarketController.address)
    .then((tx) => tx.wait());
  console.log('Successfully registered the loan product');

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
  console.log('Successfully registered supported terms');
};

module.exports.tags = ['Migration'];
module.exports.dependencies = [
  'CloseOutNetting',
  'CollateralAggregator',
  'CollateralVault',
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
  'WETH',
];
