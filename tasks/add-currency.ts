import { EthersAdapter } from '@safe-global/protocol-kit';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { getAggregatedDecimals } from '../utils/currencies';
import { Proposal } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

task('add-currency', 'Add a new currency to the protocol')
  .addParam('currency', 'Currency name', undefined, types.string)
  .addParam('haircut', 'Remaining ratio after haircut', 0, types.int)
  .addParam(
    'priceFeeds',
    'Array with the contract address of price feed',
    undefined,
    types.string,
  )
  .addParam(
    'heartbeat',
    'Countdown timer that updates the price feed',
    0,
    types.int,
  )
  .addParam('tokenAddress', 'ERC20 token address', undefined, types.string)
  .addParam(
    'isCollateral',
    'Boolean whether the currency is collateral',
    false,
    types.boolean,
  )
  .setAction(
    async (
      { currency, haircut, priceFeeds, heartbeat, tokenAddress, isCollateral },
      { deployments, ethers },
    ) => {
      if (!ethers.utils.isAddress(tokenAddress)) {
        throw new HardhatPluginError(
          'SecuredFinance',
          'Token address is not valid',
        );
      }

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

      const [owner] = await ethers.getSigners();

      const ethersAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: ethers.provider.getSigner(owner.address),
      });
      const proposal = new Proposal();
      await proposal.initSdk(ethersAdapter);

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
        priceFeeds.split(', '),
      );

      const currencyControllerArgs = [
        toBytes32(currency),
        decimals,
        haircut,
        priceFeeds.split(', '),
        heartbeat,
      ];

      const tokenVaultArgs = [toBytes32(currency), tokenAddress, isCollateral];

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

      await proposal.submit(owner.address);
    },
  );
