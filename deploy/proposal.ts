import { EthersAdapter } from '@safe-global/protocol-kit';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeploymentStorage, Proposal } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  if (process.env.ENABLE_AUTO_UPDATE === 'true') {
    console.warn('Skipped proposal creation because it is under auto update');
    return;
  }

  const { deployer } = await getNamedAccounts();
  const ethersAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: ethers.provider.getSigner(deployer),
  });
  const proposal = new Proposal();
  await proposal.initSdk(ethersAdapter);

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

  await proposal.submit(deployer);
};

func.tags = ['Proposal'];
func.dependencies = ['Migration', 'LendingMarkets', 'FutureValueVault'];

export default func;
