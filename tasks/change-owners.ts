import { Contract, ContractTransaction } from 'ethers';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { toBytes32 } from '../utils/strings';

task(
  'change-owners',
  'Change owners of all contracts to the new owner',
).setAction(async (_, { deployments, ethers }) => {
  const safeAddress = process.env.SAFE_WALLET_ADDRESS;

  if (!safeAddress) {
    const message =
      'The following environment variables must be set: SAFE_WALLET_ADDRESS';
    throw new HardhatPluginError('SecuredFinance', message);
  }

  const [owner] = await ethers.getSigners();
  let nonce = await owner.getTransactionCount();

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const contractNames = [
    'BeaconProxyController',
    'CurrencyController',
    'LendingMarketController',
    'ReserveFund',
    'TokenVault',
  ];

  const contracts: { [key: string]: Contract } = (
    await Promise.all(
      contractNames.map(async (name) => {
        const contract = await proxyController
          .getAddress(toBytes32(name))
          .then((address: string) => ethers.getContractAt(name, address));
        return [name, contract];
      }),
    )
  ).reduce((obj, [name, contract]) => {
    obj[name] = contract;
    return obj;
  }, {});

  const addressResolver = await proxyController
    .getAddressResolverAddress()
    .then((address: string) =>
      ethers.getContractAt('AddressResolver', address),
    );

  contracts['ProxyController'] = proxyController;
  contracts['AddressResolver'] = addressResolver;

  const txs: ContractTransaction[] = [];

  for (const [name, contract] of Object.entries(contracts)) {
    const currentOwner = await contract.owner();

    if (currentOwner !== owner.address) {
      console.log(`${name} owner has already been changed to ${currentOwner}`);
      continue;
    }

    const tx = await contract
      .connect(owner)
      .transferOwnership(safeAddress, { nonce });
    txs.push(tx);

    nonce++;

    console.log(`Changing owner of ${name} to ${safeAddress}`);
  }

  await Promise.all(txs.map((tx) => tx.wait()));
});
