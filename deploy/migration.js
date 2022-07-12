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
  // NOTE: When the target network is a forked chain, the contract can't return events and
  // the `queryFilter` method throw an error.
  const proxyCreatedEvents = process.env.FORK_RPC_ENDPOINT
    ? []
    : await proxyController.queryFilter(filter);

  const proxyObj = proxyCreatedEvents.reduce((obj, event) => {
    obj[event.args.id] = event.args.proxyAddress;
    return obj;
  }, {});

  const saveProxyAddress = async (name, address) => {
    // NOTE: Save a proxy address to deployment json.
    // This proxy address is used at the subgraph deployment at `secured-finance-subgraph`.
    const deployment = await deployments.get(name);
    deployment['implementation'] = deployment['address'];
    deployment['address'] = address;
    await deployments.save(name, deployment);
  };

  const getProxy = async (key, contract) => {
    let address = proxyObj[toBytes32(key)];
    // NOTE: When ProxyController is updated, proxyObj is empty because new contract doesn't have old events.
    // So in that case, the registered contract address is got from AddressResolver through ProxyController.
    if (!address) {
      address = await proxyController.getAddress(toBytes32(key));
    }

    const contractName = contract || key;
    await saveProxyAddress(contractName, address);
    return ethers.getContractAt(contractName, address);
  };

  const getProductProxy = async (prefix, key) => {
    const address =
      proxyObj[prefix.padEnd(66, 0)] ||
      (await proxyController.getProductAddress(loanPrefix));
    await saveProxyAddress(key, address);
    return ethers.getContractAt(key, address);
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

  const loan = await getProductProxy(loanPrefix, 'LoanV2');

  // Get deployed contracts
  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  // The contract name list that is managed in AddressResolver
  // This list is as same as contracts/libraries/Contracts.sol
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

  // The contract address list that is managed in AddressResolver
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

  // The contract address list that inherited MixinAddressResolver and need to call `buildCache`
  const buildCachesAddresses = [
    closeOutNetting.address,
    collateralAggregator.address,
    collateralVault.address,
    crosschainAddressResolver.address,
    lendingMarketController.address,
    liquidations.address,
    loan.address,
    markToMarket.address,
    paymentAggregator.address,
    settlementEngine.address,
    termStructure.address,
  ];

  // show log
  const logHeader = 'Proxy Addresses';
  const log = {
    AddressResolver: { [logHeader]: addressResolver.address },
    ...contractNames.reduce(
      (obj, name, idx) =>
        Object.assign(obj, {
          [name]: { [logHeader]: contractAddresses[idx] },
        }),
      {},
    ),
    Loan: { [logHeader]: loan.address },
  };

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
