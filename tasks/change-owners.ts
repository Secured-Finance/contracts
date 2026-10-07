import { BigNumber, Contract, ContractTransaction, Signer } from 'ethers';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getWaitConfirmations, Proposal } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';
import { ACCESS_CONTROL_CONTRACT_NAMES } from './helpers/access-control';

const CORE_CONTRACT_NAMES = [
  'BeaconProxyController',
  'CurrencyController',
  'LendingMarketController',
  'ReserveFund',
  'TokenVault',
] as const;

// Operational permissions are managed separately. In particular, this task must not
// change Liquidator ownership, DefaultProxyAdmin ownership, or OPERATOR_ROLE assignments.
interface OwnershipState {
  name: string;
  contract: Contract;
  currentOwner: string;
}

interface DefaultAdminState extends OwnershipState {
  defaultAdminRole: string;
  isNewOwnerDefaultAdmin: boolean;
  isDeployerDefaultAdmin: boolean;
  isCurrentOwnerDefaultAdmin: boolean;
}

interface MigrationState {
  ownership: OwnershipState[];
  defaultAdmins: DefaultAdminState[];
}

interface ChangePlan<T> {
  direct: T[];
  proposed: T[];
  estimatedGas: BigNumber;
  errors: string[];
}

interface MigrationPlan {
  ownership: ChangePlan<OwnershipState>;
  defaultAdmins: ChangePlan<DefaultAdminState>;
  estimatedGas: BigNumber;
}

const normalizeAddress = (address: string, label: string, ethers: any) => {
  try {
    return ethers.utils.getAddress(address);
  } catch {
    throw new HardhatPluginError(
      'SecuredFinance',
      `${label} is not a valid address: ${address}`,
    );
  }
};

const loadMigrationState = async (
  deployments: any,
  ethers: any,
  newOwner: string,
  deployerAddress: string,
): Promise<MigrationState> => {
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }: { address: string }) =>
      ethers.getContractAt('ProxyController', address),
    );

  const contracts: Record<string, Contract> = {};
  const resolvedContracts = await Promise.all(
    CORE_CONTRACT_NAMES.map(async (name) => {
      const address = await proxyController.getAddress(toBytes32(name));
      return [name, await ethers.getContractAt(name, address)] as const;
    }),
  );

  for (const [name, contract] of resolvedContracts) {
    contracts[name] = contract;
  }

  const addressResolverAddress =
    await proxyController.getAddressResolverAddress();
  contracts.ProxyController = proxyController;
  contracts.AddressResolver = await ethers.getContractAt(
    'AddressResolver',
    addressResolverAddress,
  );

  const ownership = await Promise.all(
    Object.entries(contracts).map(async ([name, contract]) => ({
      name,
      contract,
      currentOwner: normalizeAddress(
        await contract.owner(),
        `${name} owner`,
        ethers,
      ),
    })),
  );

  const ownersByContract = new Map(
    ownership.map(({ name, currentOwner }) => [name, currentOwner]),
  );
  const defaultAdmins = await Promise.all(
    ACCESS_CONTROL_CONTRACT_NAMES.map(async (name) => {
      const contract = contracts[name];
      const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
      const currentOwner = ownersByContract.get(name)!;

      return {
        name,
        contract,
        currentOwner,
        defaultAdminRole,
        isNewOwnerDefaultAdmin: await contract.hasRole(
          defaultAdminRole,
          newOwner,
        ),
        isDeployerDefaultAdmin: await contract.hasRole(
          defaultAdminRole,
          deployerAddress,
        ),
        isCurrentOwnerDefaultAdmin: await contract.hasRole(
          defaultAdminRole,
          currentOwner,
        ),
      };
    }),
  );

  return { ownership, defaultAdmins };
};

const planOwnershipChanges = async (
  states: OwnershipState[],
  deployer: Signer,
  deployerAddress: string,
  newOwner: string,
): Promise<ChangePlan<OwnershipState>> => {
  const plan: ChangePlan<OwnershipState> = {
    direct: [],
    proposed: [],
    estimatedGas: BigNumber.from(0),
    errors: [],
  };

  for (const state of states) {
    if (state.currentOwner === newOwner) {
      continue;
    }
    if (state.currentOwner !== deployerAddress) {
      plan.proposed.push(state);
      continue;
    }

    try {
      await state.contract
        .connect(deployer)
        .callStatic.transferOwnership(newOwner);
      plan.estimatedGas = plan.estimatedGas.add(
        await state.contract
          .connect(deployer)
          .estimateGas.transferOwnership(newOwner),
      );
      plan.direct.push(state);
    } catch {
      plan.errors.push(
        `${state.name}: direct transferOwnership preflight failed`,
      );
    }
  }

  return plan;
};

const planDefaultAdminChanges = async (
  states: DefaultAdminState[],
  deployer: Signer,
  newOwner: string,
): Promise<ChangePlan<DefaultAdminState>> => {
  const plan: ChangePlan<DefaultAdminState> = {
    direct: [],
    proposed: [],
    estimatedGas: BigNumber.from(0),
    errors: [],
  };

  for (const state of states) {
    if (state.isNewOwnerDefaultAdmin) {
      continue;
    }
    if (state.isDeployerDefaultAdmin) {
      try {
        await state.contract
          .connect(deployer)
          .callStatic.grantRole(state.defaultAdminRole, newOwner);
        plan.estimatedGas = plan.estimatedGas.add(
          await state.contract
            .connect(deployer)
            .estimateGas.grantRole(state.defaultAdminRole, newOwner),
        );
        plan.direct.push(state);
      } catch {
        plan.errors.push(
          `${state.name}: direct DEFAULT_ADMIN_ROLE grant preflight failed`,
        );
      }
    } else if (state.isCurrentOwnerDefaultAdmin) {
      plan.proposed.push(state);
    } else {
      plan.errors.push(
        `${state.name}: neither deployer nor current multisig owner can grant DEFAULT_ADMIN_ROLE`,
      );
    }
  }

  return plan;
};

const createMigrationPlan = async (
  state: MigrationState,
  deployer: Signer,
  deployerAddress: string,
  newOwner: string,
): Promise<MigrationPlan> => {
  const [ownership, defaultAdmins] = await Promise.all([
    planOwnershipChanges(state.ownership, deployer, deployerAddress, newOwner),
    planDefaultAdminChanges(state.defaultAdmins, deployer, newOwner),
  ]);
  const errors = [...ownership.errors, ...defaultAdmins.errors];

  if (errors.length > 0) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Ownership migration preflight failed:\n${errors.join('\n')}`,
    );
  }

  return {
    ownership,
    defaultAdmins,
    estimatedGas: ownership.estimatedGas.add(defaultAdmins.estimatedGas),
  };
};

const validateDeployerBalance = async (
  ethers: any,
  deployerAddress: string,
  estimatedGas: BigNumber,
): Promise<BigNumber> => {
  const [deployerBalance, feeData] = await Promise.all([
    ethers.provider.getBalance(deployerAddress),
    ethers.provider.getFeeData(),
  ]);
  let maximumGasPrice = feeData.maxFeePerGas || feeData.gasPrice;
  if (!maximumGasPrice) {
    maximumGasPrice = await ethers.provider.getGasPrice();
  }
  const estimatedTransactionCost = estimatedGas.mul(maximumGasPrice);

  if (deployerBalance.lt(estimatedTransactionCost)) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Deployer has insufficient balance. Estimated cost: ${estimatedTransactionCost.toString()}, balance: ${deployerBalance.toString()}`,
    );
  }

  return estimatedTransactionCost;
};

const printMigrationPlan = (
  state: MigrationState,
  newOwner: string,
  deployerAddress: string,
  estimatedTransactionCost: BigNumber,
) => {
  console.log('Ownership migration plan');
  console.table(
    state.ownership.map((item) => ({
      Contract: item.name,
      CurrentOwner: item.currentOwner,
      NewOwner: newOwner,
      Action:
        item.currentOwner === newOwner
          ? 'No change'
          : item.currentOwner === deployerAddress
          ? 'Direct transaction'
          : 'Multisig proposal',
    })),
  );

  console.log('DEFAULT_ADMIN_ROLE migration plan');
  console.table(
    state.defaultAdmins.map((item) => ({
      Contract: item.name,
      NewAdmin: newOwner,
      Action: item.isNewOwnerDefaultAdmin
        ? 'No change'
        : item.isDeployerDefaultAdmin
        ? 'Direct transaction'
        : 'Multisig proposal',
    })),
  );
  console.log(
    `Estimated maximum cost of direct transactions: ${estimatedTransactionCost.toString()}`,
  );
  console.log('Preflight completed; no transactions or proposals were sent');
};

const executeDefaultAdminChanges = async (
  plan: ChangePlan<DefaultAdminState>,
  proposal: Proposal | undefined,
  deployer: Signer,
  newOwner: string,
  nonce: number,
  waitConfirmations: number,
): Promise<number> => {
  for (const state of plan.direct) {
    await state.contract
      .connect(deployer)
      .grantRole(state.defaultAdminRole, newOwner, { nonce })
      .then((tx: ContractTransaction) => tx.wait(waitConfirmations));
    nonce++;
    console.log(`Granted DEFAULT_ADMIN_ROLE of ${state.name} to ${newOwner}`);
  }

  if (plan.proposed.length === 0) {
    return nonce;
  }
  if (!proposal) {
    throw new HardhatPluginError(
      'SecuredFinance',
      'Proposal was not initialized for DEFAULT_ADMIN_ROLE changes',
    );
  }
  for (const state of plan.proposed) {
    await proposal.add(
      state.contract.address,
      state.contract.interface.encodeFunctionData('grantRole', [
        state.defaultAdminRole,
        newOwner,
      ]),
    );
    console.log(
      `Proposing DEFAULT_ADMIN_ROLE grant of ${state.name} to ${newOwner}`,
    );
  }

  return nonce;
};

const executeOwnershipChanges = async (
  plan: ChangePlan<OwnershipState>,
  proposal: Proposal | undefined,
  deployer: Signer,
  newOwner: string,
  nonce: number,
  waitConfirmations: number,
): Promise<void> => {
  for (const state of plan.direct) {
    await state.contract
      .connect(deployer)
      .transferOwnership(newOwner, { nonce })
      .then((tx: ContractTransaction) => tx.wait(waitConfirmations));
    nonce++;
    console.log(`Changed owner of ${state.name} to ${newOwner}`);
  }

  if (plan.proposed.length === 0) {
    return;
  }
  if (!proposal) {
    throw new HardhatPluginError(
      'SecuredFinance',
      'Proposal was not initialized for ownership changes',
    );
  }
  for (const state of plan.proposed) {
    await proposal.add(
      state.contract.address,
      state.contract.interface.encodeFunctionData('transferOwnership', [
        newOwner,
      ]),
    );
    console.log(`Proposing owner change of ${state.name} to ${newOwner}`);
  }
};

const verifyDirectChanges = async (
  plan: MigrationPlan,
  newOwner: string,
  ethers: any,
) => {
  const errors: string[] = [];

  for (const state of plan.ownership.direct) {
    const currentOwner = normalizeAddress(
      await state.contract.owner(),
      `${state.name} owner`,
      ethers,
    );
    if (currentOwner !== newOwner) {
      errors.push(
        `${state.name}: owner is ${currentOwner}, expected ${newOwner}`,
      );
    }
  }
  for (const state of plan.defaultAdmins.direct) {
    const newOwnerHasRole = await state.contract.hasRole(
      state.defaultAdminRole,
      newOwner,
    );
    if (!newOwnerHasRole) {
      errors.push(`${state.name}: new owner is not DEFAULT_ADMIN_ROLE`);
    }
  }

  if (errors.length > 0) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Post-migration verification failed:\n${errors.join('\n')}`,
    );
  }
};

task(
  'change-owners',
  'Change owners and default admins of core protocol contracts',
)
  .addParam('newOwner', 'Address to receive ownership and default-admin roles')
  .addFlag(
    'verifyOnly',
    'Preflight and display the ownership migration plan without sending transactions',
  )
  .setAction(
    async (
      { newOwner: configuredNewOwner, verifyOnly },
      { deployments, ethers, network },
    ) => {
      const newOwner = normalizeAddress(
        configuredNewOwner,
        'New owner',
        ethers,
      );
      if (newOwner === ethers.constants.AddressZero) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'New owner must not be the zero address',
        );
      }

      const [deployer] = await ethers.getSigners();
      const deployerAddress = normalizeAddress(
        await deployer.getAddress(),
        'Deployer',
        ethers,
      );
      const state = await loadMigrationState(
        deployments,
        ethers,
        newOwner,
        deployerAddress,
      );
      const plan = await createMigrationPlan(
        state,
        deployer,
        deployerAddress,
        newOwner,
      );
      const estimatedTransactionCost = await validateDeployerBalance(
        ethers,
        deployerAddress,
        plan.estimatedGas,
      );

      if (verifyOnly) {
        printMigrationPlan(
          state,
          newOwner,
          deployerAddress,
          estimatedTransactionCost,
        );
        return;
      }

      const hasDirectChanges =
        plan.defaultAdmins.direct.length > 0 ||
        plan.ownership.direct.length > 0;
      const hasProposedChanges =
        plan.defaultAdmins.proposed.length > 0 ||
        plan.ownership.proposed.length > 0;
      if (!hasDirectChanges && !hasProposedChanges) {
        console.log('No ownership/admin changes required');
        return;
      }

      const proposal: Proposal | undefined = hasProposedChanges
        ? await Proposal.create(network.provider, deployerAddress)
        : undefined;
      let nonce = await deployer.getTransactionCount('pending');
      const waitConfirmations = getWaitConfirmations();

      // Establish the new default admin before transferring ownership.
      nonce = await executeDefaultAdminChanges(
        plan.defaultAdmins,
        proposal,
        deployer,
        newOwner,
        nonce,
        waitConfirmations,
      );
      await executeOwnershipChanges(
        plan.ownership,
        proposal,
        deployer,
        newOwner,
        nonce,
        waitConfirmations,
      );
      if (proposal) {
        await proposal.submit();
      }
      await verifyDirectChanges(plan, newOwner, ethers);

      if (hasDirectChanges) {
        console.log('Direct ownership/admin transactions completed');
      }
      if (hasProposedChanges) {
        console.log(
          'Multisig ownership/admin proposals submitted; execute them before continuing',
        );
        console.log(
          'Re-run with --verify-only after executing proposals to preview any remaining operations',
        );
      }
    },
  );
