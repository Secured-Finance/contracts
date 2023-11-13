import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeploymentStorage } from '../utils/deployment';

const func: DeployFunction = async function ({
  ethers,
}: HardhatRuntimeEnvironment) {
  if (!process.env.FORK_RPC_ENDPOINT || !process.env.SAFE_WALLET_ADDRESS) {
    return;
  }

  const forkProvider = new ethers.providers.JsonRpcProvider(
    process.env.FORK_RPC_ENDPOINT,
  );
  const safeWalletAddress = process.env.SAFE_WALLET_ADDRESS;
  const safeWalletSinger = forkProvider.getSigner(safeWalletAddress);

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

    await safeWalletSinger
      .sendTransaction({
        from: safeWalletAddress,
        to: contract.address,
        data: contract.interface.encodeFunctionData('multicall', [
          multicallData,
        ]),
      })
      .then((tx) => tx.wait());

    console.log(
      `Execute a proposal tx for ${deployment.contractName} on the forked chain`,
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
};

func.tags = ['Simulation'];
func.dependencies = ['Proposal'];

export default func;
