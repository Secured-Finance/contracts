// const btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
// const filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

const { toBytes32, hexETHString } = require('../test-utils').strings;

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

  const saveProxyAddress = async (name, proxyAddress) => {
    // NOTE: Save a proxy address to deployment json.
    // This proxy address is used at the subgraph deployment at `secured-finance-subgraph`.
    const deployment = await deployments.get(name);
    if (deployment.receipt.contractAddress === deployment.address) {
      deployment.implementation = deployment.receipt.contractAddress;
      deployment.address = proxyAddress;
      await deployments.save(name, deployment);
    }
  };

  const getProxy = async (key) => {
    let address = proxyObj[toBytes32(key)];
    // NOTE: When ProxyController is updated, proxyObj is empty because new contract doesn't have old events.
    // So in that case, the registered contract address is got from AddressResolver through ProxyController.
    if (!address) {
      address = await proxyController.getAddress(toBytes32(key));
    }
    await saveProxyAddress(key, address);
    return ethers.getContractAt(key, address);
  };

  const collateralAggregator = await getProxy('CollateralAggregator');
  const collateralVault = await getProxy('CollateralVault');
  const crosschainAddressResolver = await getProxy('CrosschainAddressResolver');
  const currencyController = await getProxy('CurrencyController');
  const lendingMarketController = await getProxy('LendingMarketController');

  // Get deployed contracts
  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  // The contract name list that is managed in AddressResolver
  // This list is as same as contracts/libraries/Contracts.sol
  const contractNames = [
    'CollateralAggregator',
    'CollateralVault',
    'CrosschainAddressResolver',
    'CurrencyController',
    'LendingMarketController',
  ];

  // The contract address list that is managed in AddressResolver
  const contractAddresses = [
    collateralAggregator.address,
    collateralVault.address,
    crosschainAddressResolver.address,
    currencyController.address,
    lendingMarketController.address,
  ];

  // The contract address list that inherited MixinAddressResolver and need to call `buildCache`
  const buildCachesAddresses = [
    collateralAggregator.address,
    collateralVault.address,
    crosschainAddressResolver.address,
    lendingMarketController.address,
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

  // // Set up for CollateralAggregator
  // await collateralAggregator.functions['register(string[],uint256[])'](
  //   [btcAddress, filAddress],
  //   [0, 461],
  // ).then((tx) => tx.wait());
  // console.log('Successfully registered the currency data');

  // Set up for CollateralVault
  await collateralVault.registerCurrency(hexETHString, wETHToken.address);
  console.log('Successfully registered the currency as supported collateral');
};

module.exports.tags = ['Migration'];
module.exports.dependencies = [
  'CollateralAggregator',
  'CollateralVault',
  'CrosschainAddressResolver',
  'CurrencyController',
  'LendingMarketController',
  'WETH',
];
