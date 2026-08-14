import { BigNumber } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getAggregatedDecimals } from '../utils/currencies';
import { Proposal, getWaitConfirmations } from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

task(
  'set-simple-price-feed',
  'Deploy a SimplePriceAggregator and use it as the price feed for a currency',
)
  .addParam('currency', 'Currency name', undefined, types.string)
  .addParam(
    'price',
    'Initial price with 8 decimals (for example, 100000000 for 1.0)',
    undefined,
    types.string,
  )
  .addParam(
    'heartbeat',
    'Countdown timer that determines when the price feed becomes stale',
    86400,
    types.int,
    true,
  )
  .addParam(
    'description',
    'Description for SimplePriceAggregator (defaults to <currency> / USD)',
    undefined,
    types.string,
    true,
  )
  .setAction(
    async (
      { currency, price, heartbeat, description },
      { deployments, ethers, getChainId, network },
    ) => {
      let initialAnswer: BigNumber;
      let currencyKey: string;

      try {
        initialAnswer = ethers.BigNumber.from(price);
      } catch {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Price must be a valid integer',
        );
      }

      if (
        initialAnswer.lte(0) ||
        initialAnswer.gt(ethers.constants.MaxInt256)
      ) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Price must be greater than 0 and fit in int256',
        );
      }

      if (!Number.isSafeInteger(heartbeat) || heartbeat <= 0) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Heartbeat must be a positive safe integer',
        );
      }

      try {
        currencyKey = toBytes32(currency);
      } catch {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Currency name must fit in bytes32',
        );
      }

      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();
      const waitConfirmations = getWaitConfirmations();
      const aggregatorDescription = description || `${currency} / USD`;

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const currencyControllerAddress = await proxyController.getAddress(
        toBytes32('CurrencyController'),
      );
      const tokenVaultAddress = await proxyController.getAddress(
        toBytes32('TokenVault'),
      );
      const currencyController = await ethers.getContractAt(
        'CurrencyController',
        currencyControllerAddress,
      );
      const tokenVault = await ethers.getContractAt(
        'TokenVault',
        tokenVaultAddress,
      );

      if (!(await currencyController.currencyExists(currencyKey))) {
        throw new HardhatPluginError(
          'SecuredFinance',
          `Currency ${currency} is not supported`,
        );
      }

      const tokenAddress = await tokenVault.getTokenAddress(currencyKey);
      const safeCurrencyName = currency.replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseDeploymentName = `${safeCurrencyName}SimplePriceAggregator`;
      const previousDeployment = await deployments.getOrNull(
        baseDeploymentName,
      );
      const deploymentName = previousDeployment
        ? `${baseDeploymentName}-${Date.now()}`
        : baseDeploymentName;

      const deployResult = await deployments.deploy(deploymentName, {
        contract: 'SimplePriceAggregator',
        from: deployerAddress,
        args: [initialAnswer.toString(), aggregatorDescription],
        log: true,
        waitConfirmations,
      });

      console.log(
        `SimplePriceAggregator for ${currency} is available at ${deployResult.address}`,
      );

      const proposal =
        process.env.ENABLE_AUTO_UPDATE !== 'true'
          ? await getChainId().then(async (chainId) =>
              isFVM(chainId)
                ? FVMProposal.create(chainId)
                : Proposal.create(network.provider, deployerAddress),
            )
          : undefined;
      const priceFeeds = [deployResult.address];
      const decimals = await getAggregatedDecimals(
        ethers,
        tokenAddress,
        priceFeeds,
      );
      const args = [currencyKey, decimals, priceFeeds, [heartbeat]];

      if (!proposal) {
        await currencyController
          .updatePriceFeed(...args)
          .then((tx) => tx.wait(waitConfirmations));

        console.log(
          `Updated the ${currency} price feed to ${deployResult.address}`,
        );
      } else {
        await proposal.add(
          currencyControllerAddress,
          currencyController.interface.encodeFunctionData(
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
