import { EthersAdapter } from '@safe-global/protocol-kit';
import { Contract } from 'ethers';
import { task, types } from 'hardhat/config';
import { getAdjustedGenesisDate } from '../utils/dates';
import { Proposal } from '../utils/deployment';
import { getMulticallOrderBookInputs } from '../utils/markets';
import { toBytes32 } from '../utils/strings';

task('add-order-books', 'Add new order books to the protocol')
  .addParam('currency', 'Currency name', undefined, types.string)
  .addParam('minDebtUnitPrice', 'The min debt unit price', undefined, types.int)
  .addParam(
    'openingDate',
    'The opening date of the order book',
    undefined,
    types.int,
    true,
  )
  .addParam(
    'preOpeningDate',
    'The pre-opening date of the order book',
    undefined,
    types.int,
    true,
  )
  .setAction(
    async (
      { currency, minDebtUnitPrice, openingDate, preOpeningDate },
      { deployments, ethers },
    ) => {
      const [owner] = await ethers.getSigners();

      const ethersAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: ethers.provider.getSigner(owner.address),
      });
      const proposal = new Proposal();
      await proposal.initSdk(ethersAdapter);

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const lendingMarketController: Contract = await proxyController
        .getAddress(toBytes32('LendingMarketController'))
        .then((address) =>
          ethers.getContractAt('LendingMarketController', address),
        );

      const multicallInputs = await getMulticallOrderBookInputs(
        lendingMarketController,
        toBytes32(currency),
        minDebtUnitPrice,
        getAdjustedGenesisDate(),
        openingDate,
        preOpeningDate,
      );

      await proposal.add(
        lendingMarketController.address,
        lendingMarketController.interface.encodeFunctionData('multicall', [
          multicallInputs.map(({ callData }) => callData),
        ]),
      );

      console.table(
        multicallInputs.map((input) => ({
          ContractName: 'LendingMarketController',
          FunctionName: input.functionName,
          Args: input.args.join(', '),
        })),
      );

      await proposal.submit(owner.address);
    },
  );
