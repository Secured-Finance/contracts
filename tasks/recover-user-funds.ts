import BigNumberJS from 'bignumber.js';
import { BigNumber, Contract } from 'ethers';
import { readFileSync } from 'fs';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { resolve } from 'path';

import { Proposal } from '../utils/deployment';
import { FVMProposal, isFVM } from '../utils/deployment-fvm';
import { toBytes32 } from '../utils/strings';

type Side = 'LEND' | 'BORROW';
const PRICE_DIGIT = 10000;

interface CorrectionInput {
  correctionId: string;
  maturity: string;
  correctionSide: Side;
  erroneousDroppedPV: string;
  unitPrice: string;
  expectedFV: string;
}

interface FundingTransactionInput {
  transactionHash: string;
  tokenVaultBalanceBefore: string;
  tokenVaultBalanceAfter: string;
}

interface RetainedLendPositionInput {
  transactionHash: string;
  logIndex: string;
  maturity: string;
  amount: string;
  futureValue: string;
}

interface CorrectionBatchInput {
  batchId: string;
  user: string;
  fundingAmount: string;
  fundingTransactions: FundingTransactionInput[];
  retainedLendPositions: RetainedLendPositionInput[];
  corrections: CorrectionInput[];
}

interface RecoveryData {
  version: 1;
  network: string;
  chainId: string;
  currency: string;
  batches: CorrectionBatchInput[];
}

interface PlannedCall {
  description: string;
  to: string;
  data: string;
  value: string;
}

const fail = (message: string): never => {
  throw new HardhatPluginError('SecuredFinance', message);
};

const requireAddress = (ethers: any, label: string, value: string) => {
  if (
    !ethers.utils.isAddress(value) ||
    value === ethers.constants.AddressZero
  ) {
    fail(`${label} is not a valid non-zero address: ${value}`);
  }
};

const requireId = (ethers: any, label: string, value: string) => {
  if (
    !ethers.utils.isHexString(value, 32) ||
    value === ethers.constants.HashZero
  ) {
    fail(`${label} must be an explicit non-zero bytes32 value`);
  }
};

const readRecoveryData = (
  root: string,
  network: string,
  currency: string,
): RecoveryData => {
  if (!/^[A-Z][A-Z0-9]*$/.test(currency)) {
    fail(`Invalid recovery currency: ${currency}`);
  }

  const path = resolve(
    root,
    'recovery-data',
    network,
    `${currency.toLowerCase()}.json`,
  );
  const data = JSON.parse(readFileSync(path, 'utf8')) as RecoveryData;
  if (data.version !== 1) fail('Unsupported recovery data version');
  if (data.network !== network) {
    fail(`Recovery data network ${data.network} does not match ${network}`);
  }
  if (data.currency !== currency) {
    fail(`Recovery data currency ${data.currency} does not match ${currency}`);
  }
  if (!Array.isArray(data.batches)) {
    fail('Recovery data must contain a batches array');
  }
  return data;
};

const planCall = (
  calls: PlannedCall[],
  description: string,
  contract: Contract,
  functionName: string,
  args: unknown[],
  value = '0',
) => {
  calls.push({
    description,
    to: contract.address,
    data: contract.interface.encodeFunctionData(functionName, args),
    value,
  });
};

task(
  'recover-user-funds',
  'Execute or propose recovery calls for one network and currency',
)
  .addParam('currency', 'Recovery currency symbol', undefined, types.string)
  .setAction(
    async (
      { currency: currencyInput },
      { config, deployments, ethers, getChainId, network },
    ) => {
      const currency = currencyInput.toUpperCase();
      const data = readRecoveryData(config.paths.root, network.name, currency);
      const chainId = await getChainId();
      if (data.chainId !== chainId) {
        fail(
          `Recovery data chainId ${data.chainId} does not match connected chain ${chainId}`,
        );
      }
      if (data.batches.length === 0) {
        fail('Recovery data contains no operations');
      }
      const recoveryReceiver = process.env.RECOVERY_RECEIVER_ADDRESS ?? '';
      if (!recoveryReceiver) {
        fail('RECOVERY_RECEIVER_ADDRESS is required');
      }
      requireAddress(ethers, 'recovery receiver', recoveryReceiver);

      const [deployer] = await ethers.getSigners();
      const deployerAddress = await deployer.getAddress();
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );
      const [controllerAddress, tokenVaultAddress] = await Promise.all([
        proxyController.getAddress(toBytes32('LendingMarketController')),
        proxyController.getAddress(toBytes32('TokenVault')),
      ]);
      const recoveryAddress = (
        await deployments.get('OrderBookIncidentRecovery')
      ).address;
      requireAddress(ethers, 'recoveryContract', recoveryAddress);

      const [controller, tokenVault, recovery] = await Promise.all([
        ethers.getContractAt('LendingMarketController', controllerAddress),
        ethers.getContractAt('TokenVault', tokenVaultAddress),
        ethers.getContractAt('OrderBookIncidentRecovery', recoveryAddress),
      ]);
      if (
        ethers.utils.getAddress(await recovery.lendingMarketController()) !==
          ethers.utils.getAddress(controllerAddress) ||
        ethers.utils.getAddress(await recovery.tokenVault()) !==
          ethers.utils.getAddress(tokenVaultAddress)
      ) {
        fail(
          'Recovery contract immutable protocol addresses do not match this deployment',
        );
      }

      const needsTokenVaultRole = data.batches.length > 0;
      if (
        !(await controller.hasRole(
          await controller.OPERATOR_ROLE(),
          recoveryAddress,
        ))
      ) {
        fail('Recovery contract does not have the Controller Operator role');
      }
      if (
        needsTokenVaultRole &&
        !(await tokenVault.hasRole(
          await tokenVault.OPERATOR_ROLE(),
          recoveryAddress,
        ))
      ) {
        fail('Recovery contract does not have the TokenVault Operator role');
      }

      for (const batch of data.batches) {
        requireId(ethers, 'batchId', batch.batchId);
        requireAddress(ethers, 'batch user', batch.user);
        if (batch.corrections.length === 0 || batch.corrections.length > 50) {
          fail(`Batch ${batch.batchId} must contain 1-50 corrections`);
        }
        if (
          !Array.isArray(batch.fundingTransactions) ||
          batch.fundingTransactions.length === 0
        ) {
          fail(`Batch ${batch.batchId} must contain funding transactions`);
        }

        const netOutflow = batch.fundingTransactions.reduce(
          (total, fundingTransaction) => {
            requireId(
              ethers,
              'funding transaction hash',
              fundingTransaction.transactionHash,
            );
            return total
              .add(fundingTransaction.tokenVaultBalanceBefore)
              .sub(fundingTransaction.tokenVaultBalanceAfter);
          },
          BigNumber.from(0),
        );
        const expectedFundingAmount = netOutflow.lt(0)
          ? BigNumber.from(0)
          : netOutflow;
        if (!expectedFundingAmount.eq(batch.fundingAmount)) {
          fail(
            `fundingAmount mismatch for ${
              batch.batchId
            }: expected ${expectedFundingAmount.toString()}`,
          );
        }
        if (!Array.isArray(batch.retainedLendPositions)) {
          fail(`Batch ${batch.batchId} must contain retainedLendPositions`);
        }
        for (const position of batch.retainedLendPositions) {
          requireId(
            ethers,
            'retained LEND position transaction hash',
            position.transactionHash,
          );
          const logIndex = BigNumber.from(position.logIndex);
          const maturity = BigNumber.from(position.maturity);
          const amount = BigNumber.from(position.amount);
          const futureValue = BigNumber.from(position.futureValue);
          if (
            logIndex.lt(0) ||
            maturity.lte(0) ||
            amount.lte(0) ||
            futureValue.lte(0)
          ) {
            fail(
              `Retained LEND position values must be positive in ${batch.batchId}`,
            );
          }
        }

        // The execution funding also covers retained executed LEND positions, while
        // BORROW corrections must precede LEND corrections to avoid an intermediate
        // underflow. Active orders are canceled before corrections and need no funding.
        let hasLendCorrection = false;
        for (const correction of batch.corrections) {
          requireId(ethers, 'correctionId', correction.correctionId);
          if (!['LEND', 'BORROW'].includes(correction.correctionSide)) {
            fail(`Invalid correctionSide: ${correction.correctionSide}`);
          }
          if (correction.correctionSide === 'LEND') {
            hasLendCorrection = true;
          } else if (hasLendCorrection) {
            fail(`BORROW correction must precede LEND in ${batch.batchId}`);
          }
          const amount = BigNumber.from(correction.erroneousDroppedPV);
          const unitPrice = BigNumber.from(correction.unitPrice);
          const calculatedFV = BigNumber.from(
            BigNumberJS(amount.toString())
              .times(PRICE_DIGIT)
              .div(unitPrice.toString())
              .dp(0)
              .toFixed(),
          );
          if (!calculatedFV.eq(correction.expectedFV)) {
            fail(
              `expectedFV mismatch for ${
                correction.correctionId
              }: expected ${calculatedFV.toString()}`,
            );
          }
        }
      }

      if (data.batches.length > 0 && !(await tokenVault.paused())) {
        fail('TokenVault is not paused');
      }

      const calls: PlannedCall[] = [];
      const nativeToken = await recovery.nativeToken();
      const ccy = toBytes32(data.currency);

      for (const batch of data.batches) {
        const tokenAddress = await tokenVault.getTokenAddress(ccy);
        const executionFundingAmount = batch.retainedLendPositions.reduce(
          (total, position) => total.add(position.amount),
          BigNumber.from(batch.fundingAmount),
        );
        const isNativeToken =
          ethers.utils.getAddress(tokenAddress) ===
          ethers.utils.getAddress(nativeToken);
        const token = isNativeToken
          ? undefined
          : await ethers.getContractAt('IERC20', tokenAddress);
        if (!executionFundingAmount.isZero() && token) {
          planCall(
            calls,
            `clear existing funding allowance ${data.currency}`,
            token,
            'approve',
            [recoveryAddress, 0],
          );
          planCall(
            calls,
            `approve funding ${data.currency}`,
            token,
            'approve',
            [recoveryAddress, executionFundingAmount],
          );
        }
        const corrections = batch.corrections.map((correction) => ({
          correctionId: correction.correctionId,
          maturity: correction.maturity,
          side: correction.correctionSide === 'LEND' ? 0 : 1,
          amount: correction.erroneousDroppedPV,
          unitPrice: correction.unitPrice,
        }));
        planCall(
          calls,
          `execute correction batch ${batch.batchId}`,
          recovery,
          'executeCorrections',
          [batch.batchId, batch.user, ccy, executionFundingAmount, corrections],
          isNativeToken ? executionFundingAmount.toString() : '0',
        );
        if (!executionFundingAmount.isZero() && token) {
          planCall(
            calls,
            `clear funding allowance ${data.currency}`,
            token,
            'approve',
            [recoveryAddress, 0],
          );
        }
      }

      const affectedUsers = [
        ...new Map(
          data.batches.map((batch) => [
            ethers.utils.getAddress(batch.user),
            batch.user,
          ]),
        ).values(),
      ];
      for (const user of affectedUsers) {
        planCall(
          calls,
          `transfer all ${data.currency} positions and Deposit for ${user} to ${recoveryReceiver}`,
          recovery,
          'executeAssetTransfer',
          [ccy, user, recoveryReceiver],
        );
      }

      console.table(
        calls.map(({ description, to, value }) => ({
          description,
          to,
          value,
        })),
      );
      const proposal =
        process.env.ENABLE_AUTO_UPDATE !== 'true'
          ? isFVM(chainId)
            ? await FVMProposal.create(chainId)
            : await Proposal.create(network.provider, deployerAddress)
          : undefined;
      if (!proposal) {
        for (const call of calls) {
          await deployer
            .sendTransaction({
              to: call.to,
              data: call.data,
              value: call.value,
            })
            .then((transactionResponse) => transactionResponse.wait());
        }
      } else {
        for (const call of calls) {
          await proposal.add(call.to, call.data, call.value);
        }
        await proposal.submit();
      }
    },
  );
