import { task, types } from 'hardhat/config';
import { FVMProposal } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

task('create-fvm-proposal', 'Create a custom proposal for FVM')
  .addParam(
    'contracts',
    'Array of contract names',
    undefined,
    types.string,
    true,
  )
  .addParam(
    'functions',
    'Array of function names',
    undefined,
    types.string,
    true,
  )
  .addParam(
    'args',
    'Array of arguments (JSON stringified arrays)',
    undefined,
    types.string,
    true,
  )
  .setAction(
    async (
      {
        contracts: contractsString,
        functions: functionsString,
        args: argsString,
      },
      { deployments, ethers, getChainId },
    ) => {
      const contracts: string[] = contractsString?.split(',') || [];
      const functions: string[] = functionsString?.split(',') || [];
      const args: any[][] = argsString
        ? argsString.split('|').map((arg) => JSON.parse(arg))
        : [];

      if (contracts.length === 0 || functions.length === 0) {
        throw new Error('Contracts and functions must be provided');
      }

      if (
        contracts.length !== functions.length ||
        contracts.length !== args.length
      ) {
        throw new Error(
          'Contracts, functions, and args must have the same length',
        );
      }

      const chainId = await getChainId();
      const proposal = await FVMProposal.create(chainId);

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const proposalItems: Array<{
        ContractName: string;
        FunctionName: string;
        Args: string;
      }> = [];

      for (let i = 0; i < contracts.length; i++) {
        const contractName = contracts[i].trim();
        const functionName = functions[i].trim();
        const functionArgs = args[i];

        const address = await proxyController.getAddress(
          toBytes32(contractName),
        );
        console.log('address:', address);

        const contract = await ethers.getContractAt(contractName, address);

        await proposal.add(
          address,
          contract.interface.encodeFunctionData(functionName, functionArgs),
        );

        proposalItems.push({
          ContractName: contractName,
          FunctionName: functionName,
          Args: functionArgs.join(', '),
        });
      }

      console.table(proposalItems);
      await proposal.submit();
    },
  );
