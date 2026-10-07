import { BigNumber, Contract, ContractTransaction, Signer } from 'ethers';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getWaitConfirmations, Proposal } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';
import { ACCESS_CONTROL_CONTRACT_NAMES } from './helpers/access-control';

interface RoleState {
  name: string;
  contract: Contract;
  currentOwner: string;
  adminRole: string;
  targetHasRole: boolean;
  deployerHasAdminRole: boolean;
  currentOwnerHasAdminRole: boolean;
}

interface RevocationPlan {
  direct: RoleState[];
  proposed: RoleState[];
  estimatedGas: BigNumber;
  errors: string[];
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

const normalizeRole = (role: string, ethers: any): string => {
  if (!ethers.utils.isHexString(role, 32)) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Role must be a 32-byte hex string: ${role}`,
    );
  }

  return ethers.utils.hexlify(role);
};

const loadRoleStates = async (
  deployments: any,
  ethers: any,
  role: string,
  targetAccount: string,
  deployerAddress: string,
): Promise<RoleState[]> => {
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }: { address: string }) =>
      ethers.getContractAt('ProxyController', address),
    );

  return Promise.all(
    ACCESS_CONTROL_CONTRACT_NAMES.map(async (name) => {
      const address = await proxyController.getAddress(toBytes32(name));
      const contract = await ethers.getContractAt(name, address);
      const [currentOwner, adminRole, targetHasRole] = await Promise.all([
        contract
          .owner()
          .then((owner: string) =>
            normalizeAddress(owner, `${name} owner`, ethers),
          ),
        contract.getRoleAdmin(role),
        contract.hasRole(role, targetAccount),
      ]);
      const [deployerHasAdminRole, currentOwnerHasAdminRole] =
        await Promise.all([
          contract.hasRole(adminRole, deployerAddress),
          contract.hasRole(adminRole, currentOwner),
        ]);

      return {
        name,
        contract,
        currentOwner,
        adminRole,
        targetHasRole,
        deployerHasAdminRole,
        currentOwnerHasAdminRole,
      };
    }),
  );
};

const createRevocationPlan = async (
  states: RoleState[],
  deployer: Signer,
  deployerAddress: string,
  role: string,
  targetAccount: string,
): Promise<RevocationPlan> => {
  const plan: RevocationPlan = {
    direct: [],
    proposed: [],
    estimatedGas: BigNumber.from(0),
    errors: [],
  };

  for (const state of states) {
    if (!state.targetHasRole) {
      continue;
    }

    const deployerCanRevoke =
      targetAccount !== deployerAddress && state.deployerHasAdminRole;
    const currentOwnerCanRevoke =
      targetAccount !== state.currentOwner && state.currentOwnerHasAdminRole;

    if (deployerCanRevoke) {
      try {
        await state.contract
          .connect(deployer)
          .callStatic.revokeRole(role, targetAccount);
        plan.estimatedGas = plan.estimatedGas.add(
          await state.contract
            .connect(deployer)
            .estimateGas.revokeRole(role, targetAccount),
        );
        plan.direct.push(state);
      } catch {
        plan.errors.push(`${state.name}: direct revokeRole preflight failed`);
      }
    } else if (currentOwnerCanRevoke) {
      plan.proposed.push(state);
    } else {
      plan.errors.push(
        `${state.name}: neither deployer nor current owner can revoke the role from ${targetAccount}`,
      );
    }
  }

  if (plan.errors.length > 0) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Role revocation preflight failed:\n${plan.errors.join('\n')}`,
    );
  }

  return plan;
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

const printRevocationPlan = (
  states: RoleState[],
  plan: RevocationPlan,
  role: string,
  targetAccount: string,
  estimatedTransactionCost: BigNumber,
) => {
  const directContracts = new Set(plan.direct.map(({ name }) => name));
  const proposedContracts = new Set(plan.proposed.map(({ name }) => name));

  console.log(`Role: ${role}`);
  console.log(`Account: ${targetAccount}`);
  console.log('Role revocation plan');
  console.table(
    states.map((state) => ({
      Contract: state.name,
      CurrentOwner: state.currentOwner,
      AdminRole: state.adminRole,
      Action: directContracts.has(state.name)
        ? 'Direct transaction'
        : proposedContracts.has(state.name)
        ? 'Multisig proposal'
        : 'No change',
    })),
  );
  console.log(
    `Estimated maximum cost of direct transactions: ${estimatedTransactionCost.toString()}`,
  );
  console.log('Preflight completed; no transactions or proposals were sent');
};

const verifyDirectRevocations = async (
  states: RoleState[],
  role: string,
  targetAccount: string,
) => {
  const errors: string[] = [];

  for (const state of states) {
    const targetHasRole = await state.contract.hasRole(role, targetAccount);
    if (targetHasRole) {
      errors.push(`${state.name}: ${targetAccount} still has role ${role}`);
    }
  }

  if (errors.length > 0) {
    throw new HardhatPluginError(
      'SecuredFinance',
      `Post-revocation verification failed:\n${errors.join('\n')}`,
    );
  }
};

task(
  'revoke-role',
  'Revoke a role from an account on all access-control contracts',
)
  .addParam('role', '32-byte role identifier to revoke')
  .addParam('account', 'Account from which the role will be revoked')
  .addFlag(
    'verifyOnly',
    'Preflight and display the role revocation plan without sending transactions',
  )
  .setAction(
    async (
      { role: configuredRole, account: configuredAccount, verifyOnly },
      { deployments, ethers, network },
    ) => {
      const role = normalizeRole(configuredRole, ethers);
      const targetAccount = normalizeAddress(
        configuredAccount,
        'Target account',
        ethers,
      );
      if (targetAccount === ethers.constants.AddressZero) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Target account must not be the zero address',
        );
      }

      const [deployer] = await ethers.getSigners();
      const deployerAddress = normalizeAddress(
        await deployer.getAddress(),
        'Deployer',
        ethers,
      );
      const states = await loadRoleStates(
        deployments,
        ethers,
        role,
        targetAccount,
        deployerAddress,
      );
      const plan = await createRevocationPlan(
        states,
        deployer,
        deployerAddress,
        role,
        targetAccount,
      );
      const estimatedTransactionCost = await validateDeployerBalance(
        ethers,
        deployerAddress,
        plan.estimatedGas,
      );

      if (verifyOnly) {
        printRevocationPlan(
          states,
          plan,
          role,
          targetAccount,
          estimatedTransactionCost,
        );
        return;
      }

      const hasDirectRevocations = plan.direct.length > 0;
      const hasProposedRevocations = plan.proposed.length > 0;

      if (!hasDirectRevocations && !hasProposedRevocations) {
        console.log('No role revocations required');
        return;
      }

      if (hasDirectRevocations) {
        let nonce = await deployer.getTransactionCount('pending');
        const waitConfirmations = getWaitConfirmations();
        for (const state of plan.direct) {
          await state.contract
            .connect(deployer)
            .revokeRole(role, targetAccount, { nonce })
            .then((tx: ContractTransaction) => tx.wait(waitConfirmations));
          nonce++;
          console.log(`Revoked role on ${state.name} from ${targetAccount}`);
        }
      }

      if (hasProposedRevocations) {
        const proposal = await Proposal.create(
          network.provider,
          deployerAddress,
        );

        for (const state of plan.proposed) {
          await proposal.add(
            state.contract.address,
            state.contract.interface.encodeFunctionData('revokeRole', [
              role,
              targetAccount,
            ]),
          );
          console.log(`Proposing role revocation on ${state.name}`);
        }

        await proposal.submit();
        console.log(
          'Multisig role-revocation proposal submitted; execute it before continuing',
        );
        console.log(
          'Re-run with --verify-only after executing proposals to preview any remaining operations',
        );
      }

      if (hasDirectRevocations) {
        await verifyDirectRevocations(plan.direct, role, targetAccount);
        console.log('Direct role-revocation transactions completed');
      }
    },
  );
