import { BigNumber, utils } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';

import { toBytes32 } from '../utils/strings';

const TRANSFER_TOPIC = utils.id('Transfer(address,address,uint256)');
const DEPOSIT_TOPIC = utils.id('Deposit(address,uint256)');
const WITHDRAWAL_TOPIC = utils.id('Withdrawal(address,uint256)');

const fail = (message: string): never => {
  throw new HardhatPluginError('SecuredFinance', message);
};

task(
  'get-token-vault-balances',
  'Get the TokenVault token balances before and after a transaction',
)
  .addParam('transactionHash', 'Transaction hash', undefined, types.string)
  .addParam('currency', 'Currency symbol', undefined, types.string)
  .setAction(
    async (
      { transactionHash, currency: currencyInput },
      { deployments, ethers, network },
    ) => {
      if (!ethers.utils.isHexString(transactionHash, 32)) {
        fail(`Invalid transaction hash: ${transactionHash}`);
      }

      const currency = currencyInput.toUpperCase();
      if (!/^[A-Z][A-Z0-9]*$/.test(currency)) {
        fail(`Invalid currency: ${currencyInput}`);
      }

      const receipt = await ethers.provider.getTransactionReceipt(
        transactionHash,
      );
      if (!receipt) {
        fail(`Transaction receipt not found: ${transactionHash}`);
      }
      if (receipt.blockNumber === 0) {
        fail('Cannot query a balance before the genesis block');
      }

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );
      const tokenVaultAddress = await proxyController.getAddress(
        toBytes32('TokenVault'),
      );
      const tokenVault = await ethers.getContractAt(
        'TokenVault',
        tokenVaultAddress,
      );
      const tokenAddress = await tokenVault.getTokenAddress(
        toBytes32(currency),
      );
      if (tokenAddress === ethers.constants.AddressZero) {
        fail(`Token address is not registered for ${currency}`);
      }

      const token = await ethers.getContractAt('IERC20', tokenAddress);

      // Historical balanceOf calls expose block boundaries, so token events are
      // also checked to identify every transaction that changed the balance.
      const [tokenVaultBalanceBefore, tokenVaultBalanceAfter, logs] =
        await Promise.all([
          token.balanceOf(tokenVaultAddress, {
            blockTag: receipt.blockNumber - 1,
          }),
          token.balanceOf(tokenVaultAddress, {
            blockTag: receipt.blockNumber,
          }),
          ethers.provider.getLogs({
            address: tokenAddress,
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber,
            topics: [[TRANSFER_TOPIC, DEPOSIT_TOPIC, WITHDRAWAL_TOPIC]],
          }),
        ]);

      const tokenVaultAddressLowerCase = tokenVaultAddress.toLowerCase();
      const balanceChangesByTransaction = new Map<string, BigNumber>();
      const addBalanceChange = (hash: string, amount: BigNumber) => {
        balanceChangesByTransaction.set(
          hash,
          (balanceChangesByTransaction.get(hash) ?? BigNumber.from(0)).add(
            amount,
          ),
        );
      };
      const addressFromTopic = (topic: string) =>
        ethers.utils.getAddress(`0x${topic.slice(-40)}`).toLowerCase();

      for (const log of logs) {
        if (log.topics[0] === TRANSFER_TOPIC && log.topics.length >= 3) {
          const from = addressFromTopic(log.topics[1]);
          const to = addressFromTopic(log.topics[2]);
          const amount = BigNumber.from(log.data);
          if (from === tokenVaultAddressLowerCase) {
            addBalanceChange(log.transactionHash, amount.mul(-1));
          }
          if (to === tokenVaultAddressLowerCase) {
            addBalanceChange(log.transactionHash, amount);
          }
          continue;
        }

        if (
          log.topics[0] === DEPOSIT_TOPIC ||
          log.topics[0] === WITHDRAWAL_TOPIC
        ) {
          const [account, amount] =
            log.topics.length >= 2
              ? [addressFromTopic(log.topics[1]), BigNumber.from(log.data)]
              : ethers.utils.defaultAbiCoder.decode(
                  ['address', 'uint256'],
                  log.data,
                );
          if (account.toLowerCase() === tokenVaultAddressLowerCase) {
            addBalanceChange(
              log.transactionHash,
              log.topics[0] === DEPOSIT_TOPIC ? amount : amount.mul(-1),
            );
          }
        }
      }

      const balanceChangingTransactions = Array.from(
        balanceChangesByTransaction.entries(),
      ).filter(([, amount]) => !amount.isZero());
      const eventBalanceChange = balanceChangingTransactions.reduce(
        (total, [, amount]) => total.add(amount),
        BigNumber.from(0),
      );
      const blockBalanceChange = tokenVaultBalanceAfter.sub(
        tokenVaultBalanceBefore,
      );
      const eventBalanceChangeMatches =
        eventBalanceChange.eq(blockBalanceChange);
      const isOnlyTokenVaultBalanceChangingTransaction =
        eventBalanceChangeMatches &&
        balanceChangingTransactions.length === 1 &&
        balanceChangingTransactions[0][0].toLowerCase() ===
          transactionHash.toLowerCase();

      console.table({
        network: network.name,
        currency,
        tokenAddress,
        tokenVaultAddress,
        transactionHash,
        blockNumber: receipt.blockNumber,
        tokenVaultBalanceBefore: tokenVaultBalanceBefore.toString(),
        tokenVaultBalanceAfter: tokenVaultBalanceAfter.toString(),
        netOutflow: tokenVaultBalanceBefore
          .sub(tokenVaultBalanceAfter)
          .toString(),
        eventBalanceChangeMatchesBlock: eventBalanceChangeMatches,
        isOnlyTokenVaultBalanceChangingTransaction,
        ...Object.fromEntries(
          balanceChangingTransactions.flatMap(([hash, amount], index) => [
            [`balanceChangingTransactionHash[${index}]`, hash],
            [`tokenVaultBalanceChange[${index}]`, amount.toString()],
          ]),
        ),
      });

      if (!eventBalanceChangeMatches) {
        console.warn(
          'The balance change calculated from Transfer/Deposit/Withdrawal events does not match the block-level balance change. The same-block transaction check is inconclusive.',
        );
      }
    },
  );
