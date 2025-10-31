import { Contract, ContractTransaction } from 'ethers';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { Proposal } from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

task(
  'change-owners',
  'Change owners of all contracts to the new owner',
).setAction(async (_, { deployments, ethers, getChainId, network }) => {
  const currentChainId = await getChainId();

  const newOwner = isFVM(currentChainId)
    ? process.env.FVM_MULTISIG_WALLET_EVM_ADDRESS
    : process.env.SAFE_WALLET_ADDRESS;

  if (!newOwner) {
    const message =
      'The following environment variables must be set: SAFE_WALLET_ADDRESS/FVM_MULTISIG_WALLET_EVM_ADDRESS';
    throw new HardhatPluginError('SecuredFinance', message);
  }

  const [owner] = await ethers.getSigners();
  let nonce = await owner.getTransactionCount();
  const [deployer] = await ethers.getSigners();

  const proposal = isFVM(currentChainId)
    ? await FVMProposal.create(currentChainId)
    : await Proposal.create(network.provider, await deployer.getAddress());
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
      .transferOwnership(newOwner, { nonce });
    txs.push(tx);

    nonce++;

    console.log(`Changing owner of ${name} to ${newOwner}`);
  }

  if (txs.length > 0) {
    await Promise.all(txs.map((tx) => tx.wait()));
    console.log(`Successfully executed all transactions`);
  }

  for (const [name, contract] of Object.entries(contracts).filter(
    ([, contract]) => !!contract.DEFAULT_ADMIN_ROLE,
  )) {
    const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

    const isSafeAddressDefaultAdmin = await contract.hasRole(
      DEFAULT_ADMIN_ROLE,
      newOwner,
    );

    if (!isSafeAddressDefaultAdmin) {
      await contract
        .connect(owner)
        .grantRole(DEFAULT_ADMIN_ROLE, newOwner)
        .then((tx) => tx.wait());

      console.log(`Granted DEFAULT_ADMIN_ROLE of ${name} to ${newOwner}`);
    }

    const isOwnerDefaultAdmin = await contract.hasRole(
      DEFAULT_ADMIN_ROLE,
      owner.address,
    );

    if (isOwnerDefaultAdmin) {
      console.log(
        `Revoking DEFAULT_ADMIN_ROLE of ${name} from ${owner.address}`,
      );

      await proposal.add(
        contract.address,
        contract.interface.encodeFunctionData('revokeRole', [
          DEFAULT_ADMIN_ROLE,
          owner.address,
        ]),
      );
    }
  }

  await proposal.submit();
});
