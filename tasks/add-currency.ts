import { EthersAdapter } from '@safe-global/protocol-kit';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getAggregatedDecimals } from '../utils/currencies';
import {
  Proposal,
  executeIfNewlyDeployment,
  getRelaySigner,
} from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

task('add-currency', 'Add a new currency to the protocol')
  .addParam('currency', 'Currency name', undefined, types.string)
  .addParam('haircut', 'Remaining ratio after haircut', 0, types.int)
  .addParam(
    'priceFeeds',
    'Array with the contract address of price feed',
    undefined,
    types.string,
    true,
  )
  .addParam(
    'heartbeats',
    'Array with the countdown timer that updates the price feed',
    undefined,
    types.string,
    true,
  )
  .addParam('tokenAddress', 'ERC20 token address', undefined, types.string)
  .addParam(
    'isCollateral',
    'Boolean whether the currency is collateral',
    false,
    types.boolean,
  )
  .addParam(
    'useStaticPrice',
    'Boolean whether to use StaticPriceAggregator as price feed',
    false,
    types.boolean,
    true,
  )
  .setAction(
    async (
      {
        currency,
        haircut,
        priceFeeds: priceFeedsString,
        heartbeats: heartbeatsString,
        tokenAddress,
        isCollateral,
        useStaticPrice,
      },
      { deployments, ethers, getChainId },
    ) => {
      const [deployer] = await ethers.getSigners();
      const signer = getRelaySigner() || deployer;

      let priceFeeds: string[] = priceFeedsString?.split(', ') || [];
      let heartbeats: string[] = heartbeatsString?.split(', ') || [];

      if (!ethers.utils.isAddress(tokenAddress)) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Token address is not valid',
        );
      }

      if (useStaticPrice) {
        const { deploy } = deployments;
        const deployResult = await deploy('StaticPriceAggregator', {
          from: await deployer.getAddress(),
          args: ['100000000', 'USDFC / USD'],
        });

        await executeIfNewlyDeployment('StaticPriceAggregator', deployResult);

        if (priceFeeds.length > 0) {
          console.warn(
            `Price feed address has been replaced with StaticPriceAggregator at ${deployResult.address}`,
          );
        }
        if (heartbeats.length > 0) {
          console.warn(
            'Price feed heartbeat has been replaced with 86400 seconds',
          );
        }

        priceFeeds = [deployResult.address];
        heartbeats = ['86400'];
      }

      if (priceFeeds.length === 0) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Price feeds must be provided',
        );
      }

      priceFeeds.forEach((priceFeed) => {
        if (!ethers.utils.isAddress(priceFeed)) {
          throw new HardhatPluginError(
            'SecuredFinance',
            'Price feed address is not valid',
          );
        }
      });

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

      const decimals = await getAggregatedDecimals(
        ethers,
        tokenAddress,
        priceFeeds,
      );

      const currencyControllerArgs = [
        toBytes32(currency),
        decimals,
        haircut,
        priceFeeds,
        heartbeats,
      ];

      const tokenVaultArgs = [toBytes32(currency), tokenAddress, isCollateral];

      if (!proposal) {
        await currencyController.contract
          .addCurrency(...currencyControllerArgs)
          .then((tx) => tx.wait());
        await tokenVault.contract
          .registerCurrency(...tokenVaultArgs)
          .then((tx) => tx.wait());
      } else {
        await proposal.add(
          currencyController.address,
          currencyController.contract.interface.encodeFunctionData(
            'addCurrency',
            currencyControllerArgs,
          ),
        );

        await proposal.add(
          tokenVault.address,
          tokenVault.contract.interface.encodeFunctionData(
            'registerCurrency',
            tokenVaultArgs,
          ),
        );

        console.table([
          {
            ContractName: 'CurrencyController',
            FunctionName: 'addCurrency',
            Args: currencyControllerArgs.join(', '),
          },
          {
            ContractName: 'TokenVault',
            FunctionName: 'registerCurrency',
            Args: tokenVaultArgs.join(', '),
          },
        ]);

        await proposal.submit();
      }
    },
  );
