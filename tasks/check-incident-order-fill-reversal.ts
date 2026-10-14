import { BigNumber, Contract, ContractReceipt } from 'ethers';
import { readFileSync } from 'fs';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { resolve } from 'path';

import { toBytes32 } from '../utils/strings';

type Side = 'LEND' | 'BORROW';

interface IncidentFillReversalInput {
  recoveryId: string;
  sourceTransactionHash: string;
  currency: string;
  maturity: string;
  orderId: string;
  taker: string;
  maker: string;
  originalTakerSide: Side;
  amount: string;
  amountInFV: string;
  expectedTakerDeposit: string;
  expectedTakerFutureValue: string;
  expectedMakerDeposit: string;
  expectedMakerFutureValue: string;
}

interface IncidentRecoveryData {
  referenceBlock: string;
  incidentFillReversal: IncidentFillReversalInput | null;
}

interface AccountState {
  deposit: BigNumber;
  futureValue: BigNumber;
}

const MANIFEST_FILE = 'order-book-incident-residual.json';
const EVENT_QUERY_BLOCK_RANGE = 20;

const fail = (message: string): never => {
  throw new HardhatPluginError('SecuredFinance', message);
};

const addressEquals = (ethers: any, left: string, right: string) =>
  ethers.utils.getAddress(left) === ethers.utils.getAddress(right);

const stateEquals = (actual: AccountState, expected: AccountState) =>
  actual.deposit.eq(expected.deposit) &&
  actual.futureValue.eq(expected.futureValue);

const getExpectedStates = (fill: IncidentFillReversalInput) => {
  const amount = BigNumber.from(fill.amount);
  const amountInFV = BigNumber.from(fill.amountInFV);
  const takerDepositDelta =
    fill.originalTakerSide === 'LEND' ? amount : amount.mul(-1);
  const takerFutureValueDelta =
    fill.originalTakerSide === 'LEND' ? amountInFV.mul(-1) : amountInFV;
  const takerBefore = {
    deposit: BigNumber.from(fill.expectedTakerDeposit),
    futureValue: BigNumber.from(fill.expectedTakerFutureValue),
  };
  const makerBefore = {
    deposit: BigNumber.from(fill.expectedMakerDeposit),
    futureValue: BigNumber.from(fill.expectedMakerFutureValue),
  };

  return {
    takerBefore,
    makerBefore,
    takerAfter: {
      deposit: takerBefore.deposit.add(takerDepositDelta),
      futureValue: takerBefore.futureValue.add(takerFutureValueDelta),
    },
    makerAfter: {
      deposit: makerBefore.deposit.sub(takerDepositDelta),
      futureValue: makerBefore.futureValue.sub(takerFutureValueDelta),
    },
  };
};

const getAccountState = async (
  controller: Contract,
  tokenVault: Contract,
  user: string,
  ccy: string,
  maturity: string,
): Promise<AccountState> => {
  const [, futureValue] = await controller.getPosition(ccy, maturity, user);
  return {
    deposit: await tokenVault.getDepositAmount(user, ccy),
    futureValue,
  };
};

const getParsedEvents = (
  receipt: ContractReceipt,
  contract: Contract,
  eventName: string,
) => {
  const address = contract.address.toLowerCase();
  const topic = contract.interface.getEventTopic(eventName);
  return receipt.logs
    .filter(
      (log) => log.address.toLowerCase() === address && log.topics[0] === topic,
    )
    .map((log) => contract.interface.parseLog(log).args);
};

const queryExecutionEvents = async (
  recovery: Contract,
  filter: any,
  referenceBlock: number,
) => {
  let toBlock = await recovery.provider.getBlockNumber();

  while (toBlock >= referenceBlock) {
    const fromBlock = Math.max(
      referenceBlock,
      toBlock - EVENT_QUERY_BLOCK_RANGE + 1,
    );
    const events = await recovery.queryFilter(filter, fromBlock, toBlock);
    if (events.length > 0) return events;
    if (fromBlock === referenceBlock) break;
    toBlock = fromBlock - 1;
  }

  return [];
};

task(
  'check-incident-order-fill-reversal',
  'Check the result of one incident order-fill reversal',
)
  .addParam('recoveryId', 'Recovery identifier', undefined, types.string)
  .setAction(async ({ recoveryId }, { config, ethers, network }) => {
    const manifestPath = resolve(
      config.paths.root,
      'recovery-data',
      network.name,
      MANIFEST_FILE,
    );
    let data: IncidentRecoveryData;
    try {
      data = JSON.parse(
        readFileSync(manifestPath, 'utf8'),
      ) as IncidentRecoveryData;
    } catch (error) {
      fail(
        `Unable to read recovery manifest ${manifestPath}: ${String(error)}`,
      );
    }

    const manifestFill = data!.incidentFillReversal;
    if (
      !manifestFill ||
      manifestFill.recoveryId.toLowerCase() !== recoveryId.toLowerCase()
    ) {
      fail(`Recovery ${recoveryId} is not present in ${manifestPath}`);
    }
    const fill = manifestFill as IncidentFillReversalInput;
    const ccy = toBytes32(fill.currency);

    const recoveryAddress = process.env.INCIDENT_FILL_RECOVERY_ADDRESS;
    if (
      !recoveryAddress ||
      !ethers.utils.isAddress(recoveryAddress) ||
      recoveryAddress === ethers.constants.AddressZero
    ) {
      fail('INCIDENT_FILL_RECOVERY_ADDRESS must be a non-zero address');
    }
    const validatedRecoveryAddress = recoveryAddress as string;
    const recovery = await ethers.getContractAt(
      'OrderBookIncidentFillRecovery',
      validatedRecoveryAddress,
    );
    const [controllerAddress, tokenVaultAddress] = await Promise.all([
      recovery.lendingMarketController(),
      recovery.tokenVault(),
    ]);
    const [controller, tokenVault, fundManagement] = await Promise.all([
      ethers.getContractAt('LendingMarketController', controllerAddress),
      ethers.getContractAt('TokenVault', tokenVaultAddress),
      ethers.getContractAt('FundManagementLogic', controllerAddress),
    ]);
    const [executed, taker, maker] = await Promise.all([
      recovery.executedRecoveries(fill.recoveryId),
      getAccountState(controller, tokenVault, fill.taker, ccy, fill.maturity),
      getAccountState(controller, tokenVault, fill.maker, ccy, fill.maturity),
    ]);
    const expected = getExpectedStates(fill);
    const beforeMatches =
      stateEquals(taker, expected.takerBefore) &&
      stateEquals(maker, expected.makerBefore);
    const afterMatches =
      stateEquals(taker, expected.takerAfter) &&
      stateEquals(maker, expected.makerAfter);

    const executionEvents = executed
      ? await queryExecutionEvents(
          recovery,
          recovery.filters.IncidentOrderFillRecoveryExecuted(
            fill.recoveryId,
            fill.orderId,
            ccy,
          ),
          Number(data!.referenceBlock),
        )
      : [];
    let eventsMatch = false;
    let transactionHash = '-';

    if (executionEvents.length === 1) {
      transactionHash = executionEvents[0].transactionHash;
      const receipt = await ethers.provider.getTransactionReceipt(
        transactionHash,
      );
      const recoveryEvents = getParsedEvents(
        receipt,
        recovery,
        'IncidentOrderFillRecoveryExecuted',
      );
      const reversalEvents = getParsedEvents(
        receipt,
        controller,
        'IncidentOrderFillReversed',
      );
      const filledEvents = getParsedEvents(
        receipt,
        fundManagement,
        'OrderFilled',
      );
      const partiallyFilledEvents = getParsedEvents(
        receipt,
        fundManagement,
        'OrderPartiallyFilled',
      );
      const reversedTakerSide = fill.originalTakerSide === 'LEND' ? 1 : 0;
      const originalTakerSide = fill.originalTakerSide === 'LEND' ? 0 : 1;

      eventsMatch =
        recoveryEvents.length === 1 &&
        reversalEvents.some(
          (args) =>
            BigNumber.from(args.orderId).eq(fill.orderId) &&
            args.ccy === ccy &&
            args.maturity.eq(fill.maturity) &&
            addressEquals(ethers, args.taker, fill.taker) &&
            addressEquals(ethers, args.maker, fill.maker) &&
            Number(args.originalTakerSide) === originalTakerSide &&
            args.amount.eq(fill.amount) &&
            args.amountInFV.eq(fill.amountInFV),
        ) &&
        filledEvents.some(
          (args) =>
            addressEquals(ethers, args.taker, fill.taker) &&
            args.ccy === ccy &&
            Number(args.side) === reversedTakerSide &&
            args.maturity.eq(fill.maturity) &&
            args.amount.eq(fill.amount) &&
            args.amountInFV.eq(fill.amountInFV) &&
            args.feeInFV.isZero(),
        ) &&
        partiallyFilledEvents.some(
          (args) =>
            BigNumber.from(args.orderId).eq(fill.orderId) &&
            addressEquals(ethers, args.maker, fill.maker) &&
            args.ccy === ccy &&
            Number(args.side) === originalTakerSide &&
            args.maturity.eq(fill.maturity) &&
            args.amount.eq(fill.amount) &&
            args.amountInFV.eq(fill.amountInFV),
        );
    }

    let status: 'NOT_RECOVERED' | 'COMPLETED' | 'INCONSISTENT';
    if (!executed && beforeMatches && executionEvents.length === 0) {
      status = 'NOT_RECOVERED';
    } else if (executed && afterMatches && eventsMatch) {
      status = 'COMPLETED';
    } else {
      status = 'INCONSISTENT';
    }

    console.table([
      {
        status,
        recoveryId: fill.recoveryId,
        executed,
        balancesMatch: executed ? afterMatches : beforeMatches,
        eventsMatch,
        transactionHash,
      },
    ]);
    console.table([
      {
        user: 'taker',
        address: fill.taker,
        deposit: taker.deposit.toString(),
        futureValue: taker.futureValue.toString(),
        expectedDeposit: (executed
          ? expected.takerAfter.deposit
          : expected.takerBefore.deposit
        ).toString(),
        expectedFutureValue: (executed
          ? expected.takerAfter.futureValue
          : expected.takerBefore.futureValue
        ).toString(),
      },
      {
        user: 'maker',
        address: fill.maker,
        deposit: maker.deposit.toString(),
        futureValue: maker.futureValue.toString(),
        expectedDeposit: (executed
          ? expected.makerAfter.deposit
          : expected.makerBefore.deposit
        ).toString(),
        expectedFutureValue: (executed
          ? expected.makerAfter.futureValue
          : expected.makerBefore.futureValue
        ).toString(),
      },
    ]);

    if (status === 'INCONSISTENT') {
      fail(`Recovery ${fill.recoveryId} has an inconsistent result`);
    }

    return { status, executed, beforeMatches, afterMatches, eventsMatch };
  });

export { getExpectedStates };
