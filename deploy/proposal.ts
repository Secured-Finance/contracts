import { EthersAdapter } from '@safe-global/protocol-kit';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  DeploymentStorage,
  Proposal,
  getRelaySigner,
} from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';

const func: DeployFunction = async function ({
  getNamedAccounts,
  ethers,
  getChainId,
}: HardhatRuntimeEnvironment) {
  if (process.env.ENABLE_AUTO_UPDATE === 'true') {
    console.warn('Skipped proposal creation because it is under auto update');
    return;
  }

  if (process.env.FORK_RPC_ENDPOINT) {
    console.warn(
      'Skipped proposal creation because the network is a forked chain',
    );
    return;
  }

  const signer =
    getRelaySigner() ||
    ethers.provider.getSigner((await getNamedAccounts()).deployer);

  const ethersAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });

  const proposal = await getChainId().then(async (chainId) =>
    isFVM(chainId)
      ? FVMProposal.create(chainId)
      : Proposal.create(ethersAdapter),
  );

  for (const [contractAddress, deployment] of Object.entries(
    DeploymentStorage.instance.deployments,
  )) {
    const contract = await ethers.getContractAt(
      deployment.contractName,
      contractAddress,
    );

    const multicallData = deployment.functions.map(({ name, args }) =>
      contract.interface.encodeFunctionData(name, args),
    );

    await proposal.add(
      contract.address,
      contract.interface.encodeFunctionData('multicall', [multicallData]),
    );

    console.log(
      `Created a proposal for ${deployment.contractName} of ${contract.address}`,
    );
    console.table(
      deployment.functions.map(({ name, args }, i) => ({
        FunctionName: name,
        Args: args.join(', '),
        EncodeData:
          multicallData[i].length > 150
            ? multicallData[i].substring(0, 150) + '…'
            : multicallData[i],
      })),
    );
  }

  await proposal.submit();
};

func.tags = ['Proposal'];
func.dependencies = [
  'Migration',
  'LendingMarkets',
  'FutureValueVault',
  'ZCToken',
];

export default func;
