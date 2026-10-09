import { Contract } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { Proposal } from '../utils/deployment';
import { fromBytes32, toBytes32 } from '../utils/strings';

type PauseAction = 'pause' | 'unpause';

task(
  'toggle-protocol-pause',
  'Pause or unpause lending markets with order books and the token vault',
)
  .addParam(
    'action',
    'Pause action (pause or unpause)',
    undefined,
    types.string,
  )
  .setAction(
    async ({ action: actionParam }, { deployments, ethers, network }) => {
      const action = actionParam.toLowerCase() as PauseAction;

      if (action !== 'pause' && action !== 'unpause') {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Action must be either pause or unpause',
        );
      }

      const [deployer] = await ethers.getSigners();
      const proposal =
        process.env.ENABLE_AUTO_UPDATE !== 'true'
          ? await Proposal.create(network.provider, await deployer.getAddress())
          : undefined;

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const contractNames = [
        'CurrencyController',
        'LendingMarketController',
        'TokenVault',
      ];

      const [
        currencyController,
        lendingMarketController,
        tokenVault,
      ]: Contract[] = await Promise.all(
        contractNames.map((name) =>
          proxyController
            .getAddress(toBytes32(name))
            .then((address: string) => ethers.getContractAt(name, address)),
        ),
      );

      const currencies: string[] = await currencyController.getCurrencies();
      const initializedCurrencies = (
        await Promise.all(
          currencies.map(async (currency) => ({
            currency,
            isInitialized:
              await lendingMarketController.isInitializedLendingMarket(
                currency,
              ),
          })),
        )
      )
        .filter(({ isInitialized }) => isInitialized)
        .map(({ currency }) => currency);

      const lendingMarketFunction = `${action}LendingMarket`;
      const operations = initializedCurrencies.map((currency) => ({
        contract: lendingMarketController,
        contractName: 'LendingMarketController',
        functionName: lendingMarketFunction,
        args: [currency],
        displayArgs: fromBytes32(currency),
      }));

      operations.push({
        contract: tokenVault,
        contractName: 'TokenVault',
        functionName: action,
        args: [],
        displayArgs: '',
      });

      if (proposal) {
        for (const operation of operations) {
          await proposal.add(
            operation.contract.address,
            operation.contract.interface.encodeFunctionData(
              operation.functionName,
              operation.args,
            ),
          );
        }

        console.table(
          operations.map(({ contractName, functionName, displayArgs }) => ({
            ContractName: contractName,
            FunctionName: functionName,
            Args: displayArgs,
          })),
        );

        await proposal.submit();
        return;
      }

      for (const operation of operations) {
        await operation.contract[operation.functionName](
          ...operation.args,
        ).then((tx) => tx.wait());

        console.log(
          `Successfully executed ${operation.contractName}#${
            operation.functionName
          }${operation.displayArgs ? ` for ${operation.displayArgs}` : ''}`,
        );
      }
    },
  );
