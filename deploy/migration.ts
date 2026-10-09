import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeploymentStorage, getWaitConfirmations } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const waitConfirmations = getWaitConfirmations();

  const currentBlockNumber = await ethers.provider.getBlockNumber();

  // Get deployments
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
    waitConfirmations,
  }).then(({ address }) =>
    ethers.getContractAt('MigrationAddressResolver', address),
  );

  // Update proxy contracts
  const deployment =
    DeploymentStorage.instance.deployments[proxyController.address];

  if (process.env.ENABLE_AUTO_UPDATE === 'true' && deployment) {
    const tx = await proxyController.multicall(
      deployment.functions.map(({ name, args }) =>
        proxyController.interface.encodeFunctionData(name, args),
      ),
    );

    await tx.wait(waitConfirmations);

    console.log('Updated proxy contracts');
    console.table(
      deployment.functions.map(({ name, args }) => ({
        FunctionName: name,
        Args: args.join(', '),
      })),
    );

    DeploymentStorage.instance.remove(proxyController.address);
  }

  // Get contracts from proxyController
  const filter = proxyController.filters.ProxyUpdated();
  // NOTE: When the target network is a forked chain, the contract can't return events and
  // the `queryFilter` method throw an error.
  const proxyCreatedEvents =
    process.env.FORK_RPC_ENDPOINT || !isInitialDeployment
      ? []
      : await proxyController.queryFilter(filter, currentBlockNumber);

  const proxyObj = proxyCreatedEvents.reduce((obj, event) => {
    obj[event.args?.id] = event.args?.proxyAddress;
    return obj;
  }, {});

  const saveProxyAddress = async (name, proxyAddress) => {
    // NOTE: Save a proxy address to deployment json.
    // This proxy address is used at the subgraph deployment at `secured-finance-subgraph`.
    const deployment = await deployments.get(name);
    if (deployment.receipt?.contractAddress === deployment.address) {
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

  const beaconProxyController = await getProxy('BeaconProxyController');
  const currencyController = await getProxy('CurrencyController');
  const genesisValueVault = await getProxy('GenesisValueVault');
  const lendingMarketController = await getProxy('LendingMarketController');
  const reserveFund = await getProxy('ReserveFund');
  const tokenVault = await getProxy('TokenVault');

  // Get deployed contracts
  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));

  // The contract name list that is managed in AddressResolver
  // This list is as same as contracts/libraries/Contracts.sol
  const contractNames = [
    'BeaconProxyController',
    'CurrencyController',
    'GenesisValueVault',
    'LendingMarketController',
    'ReserveFund',
    'TokenVault',
  ];

  // The contract address list that is managed in AddressResolver
  const contractAddresses = [
    beaconProxyController.address,
    currencyController.address,
    genesisValueVault.address,
    lendingMarketController.address,
    reserveFund.address,
    tokenVault.address,
  ];

  // The contract address list that inherited MixinAddressResolver and need to call `buildCache`
  const buildCachesAddresses = [
    beaconProxyController.address,
    genesisValueVault.address,
    lendingMarketController.address,
    reserveFund.address,
    tokenVault.address,
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

  // Set up for AddressResolver
  if (!isInitialDeployment) {
    console.warn('Skipped migration settings');
  } else {
    await addressResolver
      .importAddresses(contractNames.map(toBytes32), contractAddresses)
      .then((tx) => tx.wait(waitConfirmations));
    console.log('Imported Addresses into AddressResolver');

    await migrationAddressResolver
      .buildCaches(buildCachesAddresses)
      .then((tx) => tx.wait(waitConfirmations));
    console.log('Built address caches of AddressResolver');
  }
};

func.tags = ['Migration'];
func.dependencies = [
  'CurrencyController',
  'GenesisValueVault',
  'LendingMarketController',
  'ReserveFund',
  'TokenVault',
  'Tokens',
];

export default func;
