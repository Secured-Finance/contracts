import { EthersAdapter } from '@safe-global/protocol-kit';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getAggregatedDecimals } from '../utils/currencies';
import { Proposal, getRelaySigner } from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

task('update-price-feed', 'Update a price feed with new parameters')
  .addParam('currency', 'Currency name', undefined, types.string)
  .addParam(
    'priceFeeds',
    'Array with the contract address of price feed',
    undefined,
    types.string,
  )
  .addParam(
    'heartbeats',
    'Array with the countdown timer that updates the price feed',
    undefined,
    types.string,
  )
  .setAction(
    async (
      { currency, priceFeeds, heartbeats },
      { deployments, ethers, getChainId },
    ) => {
      if (priceFeeds.split(', ').length === 0) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Price feeds must be provided',
        );
      }

      priceFeeds.split(', ').forEach((priceFeed) => {
        if (!ethers.utils.isAddress(priceFeed)) {
          throw new HardhatPluginError(
            'SecuredFinance',
            'Price feed address is not valid',
          );
        }
      });

      const signer = getRelaySigner() || (await ethers.getSigners())[0];

      const ethersAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
      });

      const proposal =
        process.env.ENABLE_AUTO_UPDATE !== 'true'
          ? await getChainId().then(async (chainId) =>
              isFVM(chainId)
                ? FVMProposal.create(chainId)
                : Proposal.create(ethersAdapter),
            )
          : undefined;

      const contractNames = ['CurrencyController', 'TokenVault'];

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const [currencyController, tokenVault] = await Promise.all(
        contractNames.map(async (name) => {
          const address = await proxyController.getAddress(toBytes32(name));
          const contract = await ethers.getContractAt(name, address);
          return { address, contract };
        }),
      );

      const tokenAddress = await tokenVault.contract.getTokenAddress(
        toBytes32(currency),
      );

      const decimals = await getAggregatedDecimals(
        ethers,
        tokenAddress,
        priceFeeds.split(', '),
      );

      const args = [
        toBytes32(currency),
        decimals,
        priceFeeds.split(', '),
        heartbeats.split(', '),
      ];

      if (!proposal) {
        await currencyController.contract
          .updatePriceFeed(...args)
          .then((tx) => tx.wait());
      } else {
        await proposal.add(
          currencyController.address,
          currencyController.contract.interface.encodeFunctionData(
            'updatePriceFeed',
            args,
          ),
        );

        console.table([
          {
            ContractName: 'CurrencyController',
            FunctionName: 'updatePriceFeed',
            Args: args.join(', '),
          },
        ]);

        await proposal.submit();
      }
    },
  );
