import { BigNumber, Contract, providers, utils } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';

import { toBytes32 } from '../utils/strings';
import {
  ChainPosition,
  NettingTransfer,
  Supply,
  VaultReplayEvent,
  assessResidualUpdatePossibility,
  replayVaultEvents,
} from '../utils/vault-total-supply-replay';

const PLUGIN_NAME = 'SecuredFinance';
const GENESIS_SCOPE = 'genesis';

type SupplyComparison = {
  vault: 'GenesisValueVault' | 'FutureValueVault';
  maturity: string;
  storedLending: string;
  expectedLending: string;
  lendingCorrection: string;
  storedBorrowing: string;
  expectedBorrowing: string;
  borrowingCorrection: string;
  status: 'OK' | 'MISMATCH';
};

type LockedComparison = {
  vault: 'GenesisValueVault' | 'FutureValueVault';
  scope: string;
  stored: string;
  expected: string;
  status: 'OK' | 'MISMATCH';
};

type ResidualUpdateCheck = {
  maturity: string;
  isAutoRolled: boolean;
  autoRollBlock: number | null;
  pendingOrderAmount: string;
  firstNettingTransferBlock: number | null;
  lastNettingTransferBlock: number | null;
  nettingTransferCount: number;
  nettingTransfersBeforeAutoRoll: boolean | null;
  residualUpdatePossible: boolean;
  status:
    | 'NOT_AUTO_ROLLED'
    | 'BLOCKED_BY_INFLATED_TOTALS'
    | 'PENDING_ORDERS_REMAIN'
    | 'POSSIBLE';
  reason: string;
};

const fail = (message: string): never => {
  throw new HardhatPluginError(PLUGIN_NAME, message);
};

const toBigInt = (value: BigNumber): bigint => BigInt(value.toString());

const toNumber = (value: BigNumber | number): number =>
  BigNumber.isBigNumber(value) ? value.toNumber() : value;

const logBase = (log: providers.Log) => ({
  blockNumber: log.blockNumber,
  transactionIndex: log.transactionIndex,
  logIndex: log.logIndex,
  transactionHash: log.transactionHash,
});

const sortLogs = (logs: providers.Log[]): providers.Log[] =>
  logs.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      left.transactionIndex - right.transactionIndex ||
      left.logIndex - right.logIndex,
  );

/**
 * RPC providers impose different eth_getLogs limits. Start with the complete
 * range and bisect only when the provider rejects it.
 */
const getLogsAdaptive = async (
  provider: providers.Provider,
  filter: providers.Filter,
  fromBlock: number,
  toBlock: number,
): Promise<providers.Log[]> => {
  const ranges: Array<[number, number]> = [[fromBlock, toBlock]];
  const logs: providers.Log[] = [];

  while (ranges.length > 0) {
    const [rangeFrom, rangeTo] = ranges.pop()!;
    try {
      logs.push(
        ...(await provider.getLogs({
          ...filter,
          fromBlock: rangeFrom,
          toBlock: rangeTo,
        })),
      );
    } catch (error) {
      if (rangeFrom === rangeTo) {
        throw new HardhatPluginError(
          PLUGIN_NAME,
          `Failed to fetch logs at block ${rangeFrom}`,
          error instanceof Error ? error : undefined,
        );
      }

      const middle = Math.floor((rangeFrom + rangeTo) / 2);
      ranges.push([middle + 1, rangeTo], [rangeFrom, middle]);
    }
  }

  return sortLogs(logs);
};

/**
 * Locates a proxy's CREATE block in O(log n) historical RPC calls. Some RPCs
 * do not expose historical state, in which case the caller falls back to a
 * log scan.
 */
const findContractCreationBlock = async (
  provider: providers.Provider,
  address: string,
  fromBlock: number,
  toBlock: number,
): Promise<number | undefined> => {
  try {
    if ((await provider.getCode(address, toBlock)) === '0x') {
      return undefined;
    }
    if ((await provider.getCode(address, fromBlock)) !== '0x') {
      return fromBlock;
    }

    let lower = fromBlock + 1;
    let upper = toBlock;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if ((await provider.getCode(address, middle)) === '0x') {
        lower = middle + 1;
      } else {
        upper = middle;
      }
    }
    return lower;
  } catch {
    return undefined;
  }
};

const parseFutureValueEvents = (
  vault: Contract,
  logs: providers.Log[],
): VaultReplayEvent[] =>
  logs.map((log) => {
    const parsed = vault.interface.parseLog(log);
    const orderBookId = toNumber(parsed.args.orderBookId);
    const balanceGroup = orderBookId.toString();

    if (parsed.name === 'Transfer') {
      return {
        ...logBase(log),
        kind: 'transfer',
        supplyScope: parsed.args.maturity.toString(),
        balanceGroup,
        from: parsed.args.from,
        to: parsed.args.to,
        value: toBigInt(parsed.args.value),
      };
    }

    if (parsed.name === 'BalanceLocked') {
      return {
        ...logBase(log),
        kind: 'lock',
        balanceGroup,
        user: parsed.args.user,
        value: toBigInt(parsed.args.value),
      };
    }

    if (parsed.name === 'BalanceUnlocked') {
      return {
        ...logBase(log),
        kind: 'unlock',
        balanceGroup,
        user: parsed.args.user,
        value: toBigInt(parsed.args.value),
      };
    }

    return fail(`Unsupported FutureValueVault event: ${parsed.name}`);
  });

const parseGenesisValueEvents = (
  vault: Contract,
  currency: string,
  logs: providers.Log[],
): VaultReplayEvent[] =>
  logs.map((log) => {
    const parsed = vault.interface.parseLog(log);

    if (parsed.name === 'Transfer') {
      return {
        ...logBase(log),
        kind: 'transfer',
        supplyScope: GENESIS_SCOPE,
        balanceGroup: currency,
        from: parsed.args.from,
        to: parsed.args.to,
        value: toBigInt(parsed.args.value),
      };
    }

    if (parsed.name === 'BalanceLocked') {
      return {
        ...logBase(log),
        kind: 'lock',
        balanceGroup: currency,
        user: parsed.args.user,
        value: toBigInt(parsed.args.value),
      };
    }

    if (parsed.name === 'BalanceUnlocked') {
      return {
        ...logBase(log),
        kind: 'unlock',
        balanceGroup: currency,
        user: parsed.args.user,
        value: toBigInt(parsed.args.value),
      };
    }

    return fail(`Unsupported GenesisValueVault event: ${parsed.name}`);
  });

const compareSupply = (
  vault: SupplyComparison['vault'],
  maturity: string,
  storedLending: BigNumber,
  storedBorrowing: BigNumber,
  expected: Supply,
): SupplyComparison => {
  const storedLendingValue = toBigInt(storedLending);
  const storedBorrowingValue = toBigInt(storedBorrowing);
  const lendingCorrection = expected.lending - storedLendingValue;
  const borrowingCorrection = expected.borrowing - storedBorrowingValue;

  return {
    vault,
    maturity,
    storedLending: storedLendingValue.toString(),
    expectedLending: expected.lending.toString(),
    lendingCorrection: lendingCorrection.toString(),
    storedBorrowing: storedBorrowingValue.toString(),
    expectedBorrowing: expected.borrowing.toString(),
    borrowingCorrection: borrowingCorrection.toString(),
    status:
      lendingCorrection === 0n && borrowingCorrection === 0n
        ? 'OK'
        : 'MISMATCH',
  };
};

const compareLockedBalance = (
  vault: LockedComparison['vault'],
  scope: string,
  stored: BigNumber,
  expected: bigint,
): LockedComparison => {
  const storedValue = toBigInt(stored);
  return {
    vault,
    scope,
    stored: storedValue.toString(),
    expected: expected.toString(),
    status: storedValue === expected ? 'OK' : 'MISMATCH',
  };
};

const serializeNettingTransfer = (
  vault: 'GenesisValueVault' | 'FutureValueVault',
  transfer: NettingTransfer,
  reserveFundAddress: string,
) => ({
  vault,
  blockNumber: transfer.blockNumber,
  transactionHash: transfer.transactionHash,
  maturity: vault === 'FutureValueVault' ? transfer.supplyScope : undefined,
  orderBookId: vault === 'FutureValueVault' ? transfer.balanceGroup : undefined,
  classification:
    vault === 'GenesisValueVault' &&
    transfer.to.toLowerCase() === reserveFundAddress.toLowerCase()
      ? 'reserve-fund-related'
      : 'transfer',
  from: transfer.from,
  to: transfer.to,
  value: transfer.value.toString(),
  senderBalanceBefore: transfer.senderBalanceBefore.toString(),
  receiverBalanceBefore: transfer.receiverBalanceBefore.toString(),
  receiverBalanceAfter: transfer.receiverBalanceAfter.toString(),
  offsetAmount: transfer.offsetAmount.toString(),
  lendingDelta: transfer.lendingDelta.toString(),
  borrowingDelta: transfer.borrowingDelta.toString(),
});

const chainPosition = (log: providers.Log): ChainPosition => ({
  blockNumber: log.blockNumber,
  transactionIndex: log.transactionIndex,
  logIndex: log.logIndex,
});

task(
  'check-vault-total-supplies',
  'Replay vault events and check total supplies for one currency',
)
  .addParam('currency', 'Currency symbol', undefined, types.string)
  .addOptionalParam(
    'fromBlock',
    'Block at or before LendingMarketInitialized (defaults to ProxyController deployment)',
    undefined,
    types.int,
  )
  .addOptionalParam(
    'toBlock',
    'Snapshot block (defaults to latest)',
    undefined,
    types.int,
  )
  .addFlag('details', 'Print transfers that netted an opposite-sign balance')
  .addFlag('json', 'Print the result as JSON')
  .addFlag('failOnMismatch', 'Fail the task when a supply mismatch is found')
  .setAction(
    async (
      {
        currency: currencyInput,
        fromBlock: fromBlockInput,
        toBlock: toBlockInput,
        details,
        json,
        failOnMismatch,
      },
      { deployments, ethers, network },
    ) => {
      const currencyName = currencyInput.toUpperCase();
      if (!/^[A-Z][A-Z0-9]*$/.test(currencyName)) {
        fail(`Invalid currency: ${currencyInput}`);
      }

      let currency: string;
      try {
        currency = toBytes32(currencyName);
      } catch {
        return fail(`Currency is too long for bytes32: ${currencyInput}`);
      }

      const latestBlock = await ethers.provider.getBlockNumber();
      const snapshotBlock = toBlockInput ?? latestBlock;
      if (snapshotBlock < 0 || snapshotBlock > latestBlock) {
        fail(
          `Invalid snapshot block ${snapshotBlock}; latest block is ${latestBlock}`,
        );
      }

      const proxyControllerDeployment = await deployments.get(
        'ProxyController',
      );
      const deploymentBlock = Number(
        proxyControllerDeployment.receipt?.blockNumber,
      );
      const scanFromBlock = fromBlockInput ?? deploymentBlock;
      if (!Number.isInteger(scanFromBlock) || scanFromBlock < 0) {
        fail(
          'ProxyController deployment block is unavailable; specify --from-block',
        );
      }
      if (scanFromBlock > snapshotBlock) {
        fail('--from-block must not be greater than --to-block');
      }

      const proxyController = await ethers.getContractAt(
        'ProxyController',
        proxyControllerDeployment.address,
      );
      const [
        lendingMarketControllerAddress,
        genesisValueVaultAddress,
        reserveFundAddress,
      ] = await Promise.all(
        ['LendingMarketController', 'GenesisValueVault', 'ReserveFund'].map(
          (name) =>
            proxyController.getAddress(toBytes32(name), {
              blockTag: snapshotBlock,
            }),
        ),
      );

      const lendingMarketController = await ethers.getContractAt(
        'LendingMarketController',
        lendingMarketControllerAddress,
      );
      if (
        !(await lendingMarketController.isInitializedLendingMarket(currency, {
          blockTag: snapshotBlock,
        }))
      ) {
        fail(`${currencyName} lending market is not initialized`);
      }

      const futureValueVaultAddress =
        await lendingMarketController.getFutureValueVault(currency, {
          blockTag: snapshotBlock,
        });
      const [futureValueVault, genesisValueVault] = await Promise.all([
        ethers.getContractAt('FutureValueVault', futureValueVaultAddress),
        ethers.getContractAt('GenesisValueVault', genesisValueVaultAddress),
      ]);

      const initializationInterface = new utils.Interface([
        'event LendingMarketInitialized(bytes32 indexed ccy,uint256 genesisDate,uint256 compoundFactor,uint256 orderFeeRate,uint256 circuitBreakerLimitRange,address lendingMarket,address futureValueVault)',
      ]);
      const initializationFilter = {
        address: lendingMarketControllerAddress,
        topics: [
          initializationInterface.getEventTopic('LendingMarketInitialized'),
          currency,
        ],
      };
      const creationBlock = await findContractCreationBlock(
        ethers.provider,
        futureValueVaultAddress,
        scanFromBlock,
        snapshotBlock,
      );
      let initializationSearch = 'archive-code-binary-search';
      let initializationLogs =
        creationBlock !== undefined
          ? await ethers.provider.getLogs({
              ...initializationFilter,
              fromBlock: creationBlock,
              toBlock: creationBlock,
            })
          : [];

      if (initializationLogs.length !== 1) {
        initializationSearch = 'adaptive-log-scan';
        initializationLogs = await getLogsAdaptive(
          ethers.provider,
          initializationFilter,
          scanFromBlock,
          snapshotBlock,
        );
      }
      if (initializationLogs.length !== 1) {
        fail(
          `Expected one LendingMarketInitialized event for ${currencyName}, found ${initializationLogs.length}. Check --from-block and --to-block.`,
        );
      }

      const initialization = initializationInterface.parseLog(
        initializationLogs[0],
      );
      if (
        initialization.args.futureValueVault.toLowerCase() !==
        futureValueVaultAddress.toLowerCase()
      ) {
        fail(
          `FutureValueVault address differs from LendingMarketInitialized: ${initialization.args.futureValueVault} != ${futureValueVaultAddress}`,
        );
      }
      const startBlock = initializationLogs[0].blockNumber;

      const futureTopics = [
        futureValueVault.interface.getEventTopic('Transfer'),
        futureValueVault.interface.getEventTopic('BalanceLocked'),
        futureValueVault.interface.getEventTopic('BalanceUnlocked'),
      ];
      const genesisTopics = [
        genesisValueVault.interface.getEventTopic('Transfer'),
        genesisValueVault.interface.getEventTopic('BalanceLocked'),
        genesisValueVault.interface.getEventTopic('BalanceUnlocked'),
      ];
      const autoRollTopic =
        genesisValueVault.interface.getEventTopic('AutoRollExecuted');

      const [futureLogs, genesisLogs, autoRollLogs] = await Promise.all([
        getLogsAdaptive(
          ethers.provider,
          { address: futureValueVaultAddress, topics: [futureTopics] },
          startBlock,
          snapshotBlock,
        ),
        getLogsAdaptive(
          ethers.provider,
          {
            address: genesisValueVaultAddress,
            topics: [genesisTopics, currency],
          },
          startBlock,
          snapshotBlock,
        ),
        getLogsAdaptive(
          ethers.provider,
          {
            address: genesisValueVaultAddress,
            topics: [autoRollTopic, currency],
          },
          startBlock,
          snapshotBlock,
        ),
      ]);

      const autoRollPositions = new Map<string, ChainPosition>();
      for (const log of autoRollLogs) {
        const parsed = genesisValueVault.interface.parseLog(log);
        const maturity = parsed.args.previousMaturity.toString();
        if (autoRollPositions.has(maturity)) {
          fail(
            `Multiple AutoRollExecuted events found for maturity ${maturity}`,
          );
        }
        autoRollPositions.set(maturity, chainPosition(log));
      }

      const futureReplay = replayVaultEvents(
        parseFutureValueEvents(futureValueVault, futureLogs),
      );
      const genesisReplay = replayVaultEvents(
        parseGenesisValueEvents(genesisValueVault, currency, genesisLogs),
      );

      const genesisExpected = genesisReplay.supplies.get(GENESIS_SCOPE) ?? {
        lending: 0n,
        borrowing: 0n,
      };
      const [genesisStoredLending, genesisStoredBorrowing] = await Promise.all([
        genesisValueVault.getTotalLendingSupply(currency, {
          blockTag: snapshotBlock,
        }),
        genesisValueVault.getTotalBorrowingSupply(currency, {
          blockTag: snapshotBlock,
        }),
      ]);

      const supplyComparisons: SupplyComparison[] = [
        compareSupply(
          'GenesisValueVault',
          '-',
          genesisStoredLending,
          genesisStoredBorrowing,
          genesisExpected,
        ),
      ];

      const currentMaturities: BigNumber[] =
        await lendingMarketController.getMaturities(currency, {
          blockTag: snapshotBlock,
        });
      const maturities = new Set<string>([
        ...futureReplay.supplies.keys(),
        ...currentMaturities.map((maturity) => maturity.toString()),
      ]);

      for (const maturity of [...maturities].sort((left, right) =>
        BigInt(left) < BigInt(right)
          ? -1
          : BigInt(left) > BigInt(right)
          ? 1
          : 0,
      )) {
        const [storedLending, storedBorrowing] = await Promise.all([
          futureValueVault.getTotalLendingSupply(maturity, {
            blockTag: snapshotBlock,
          }),
          futureValueVault.getTotalBorrowingSupply(maturity, {
            blockTag: snapshotBlock,
          }),
        ]);
        supplyComparisons.push(
          compareSupply(
            'FutureValueVault',
            maturity,
            storedLending,
            storedBorrowing,
            futureReplay.supplies.get(maturity) ?? {
              lending: 0n,
              borrowing: 0n,
            },
          ),
        );
      }

      const lockedComparisons: LockedComparison[] = [];
      lockedComparisons.push(
        compareLockedBalance(
          'GenesisValueVault',
          currencyName,
          await genesisValueVault.getTotalLockedBalance(currency, {
            blockTag: snapshotBlock,
          }),
          genesisReplay.lockedBalances.get(currency) ?? 0n,
        ),
      );

      const currentOrderBookIds: Array<BigNumber | number> =
        await lendingMarketController.getOrderBookIds(currency, {
          blockTag: snapshotBlock,
        });
      const orderBookIds = new Set<string>([
        ...futureReplay.lockedBalances.keys(),
        ...currentOrderBookIds.map((orderBookId) => orderBookId.toString()),
      ]);
      for (const orderBookId of [...orderBookIds].sort(
        (left, right) => Number(left) - Number(right),
      )) {
        lockedComparisons.push(
          compareLockedBalance(
            'FutureValueVault',
            `orderBookId=${orderBookId}`,
            await futureValueVault.getTotalLockedBalance(orderBookId, {
              blockTag: snapshotBlock,
            }),
            futureReplay.lockedBalances.get(orderBookId) ?? 0n,
          ),
        );
      }

      const invalidLockedBalances = lockedComparisons.filter(
        ({ status }) => status === 'MISMATCH',
      );
      if (invalidLockedBalances.length > 0) {
        if (!json) {
          console.table(invalidLockedBalances);
        }
        fail(
          'Event replay validation failed because a locked balance did not match. The supply comparison is not reliable.',
        );
      }

      const nettingTransfers = [
        ...futureReplay.nettingTransfers.map((transfer) =>
          serializeNettingTransfer(
            'FutureValueVault',
            transfer,
            reserveFundAddress,
          ),
        ),
        ...genesisReplay.nettingTransfers.map((transfer) =>
          serializeNettingTransfer(
            'GenesisValueVault',
            transfer,
            reserveFundAddress,
          ),
        ),
      ].sort(
        (left, right) =>
          left.blockNumber - right.blockNumber ||
          left.transactionHash.localeCompare(right.transactionHash),
      );

      const mismatches = supplyComparisons.filter(
        ({ status }) => status === 'MISMATCH',
      );
      const futureMismatches = mismatches.filter(
        (comparison) => comparison.vault === 'FutureValueVault',
      );
      const residualUpdateChecks: ResidualUpdateCheck[] = await Promise.all(
        futureMismatches.map(async (comparison) => {
          const maturity = comparison.maturity;
          const maturityNettingTransfers = futureReplay.nettingTransfers.filter(
            (transfer) => transfer.supplyScope === maturity,
          );
          const autoRollPosition = autoRollPositions.get(maturity);
          const [isAutoRolled, pendingOrderAmount] = await Promise.all([
            genesisValueVault.isAutoRolled(currency, maturity, {
              blockTag: snapshotBlock,
            }),
            lendingMarketController.getPendingOrderAmount(currency, maturity, {
              blockTag: snapshotBlock,
            }),
          ]);
          const assessment = assessResidualUpdatePossibility({
            isAutoRolled,
            pendingOrderAmount: toBigInt(pendingOrderAmount),
            supplyIsInflated:
              BigInt(comparison.lendingCorrection) < 0n ||
              BigInt(comparison.borrowingCorrection) < 0n,
            nettingTransferPositions: maturityNettingTransfers,
            autoRollPosition,
          });

          return {
            maturity,
            isAutoRolled,
            autoRollBlock: autoRollPosition?.blockNumber ?? null,
            pendingOrderAmount: pendingOrderAmount.toString(),
            firstNettingTransferBlock:
              maturityNettingTransfers[0]?.blockNumber ?? null,
            lastNettingTransferBlock:
              maturityNettingTransfers[maturityNettingTransfers.length - 1]
                ?.blockNumber ?? null,
            nettingTransferCount: maturityNettingTransfers.length,
            ...assessment,
          };
        }),
      );
      const result = {
        network: network.name,
        currency: currencyName,
        snapshotBlock,
        startBlock,
        initializationSearch,
        addresses: {
          lendingMarketController: lendingMarketControllerAddress,
          futureValueVault: futureValueVaultAddress,
          genesisValueVault: genesisValueVaultAddress,
        },
        logCounts: {
          futureValueVault: futureLogs.length,
          genesisValueVault: genesisLogs.length,
          autoRollExecuted: autoRollLogs.length,
        },
        supplies: supplyComparisons,
        replayValidation: lockedComparisons,
        residualUpdateChecks,
        residualUpdateCheckAssumption:
          'pendingOrderAmounts did not increase after AutoRollExecuted (including addPendingOrderAmountForRecovery).',
        nettingTransferCount: nettingTransfers.length,
        ...(details ? { nettingTransfers } : {}),
        status: mismatches.length === 0 ? 'OK' : 'MISMATCH',
      };

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `Vault total supply check: ${network.name} ${currencyName} @ block ${snapshotBlock}`,
        );
        console.log(
          `Replayed ${futureLogs.length} FutureValueVault logs and ${genesisLogs.length} GenesisValueVault logs from block ${startBlock}`,
        );
        console.table(supplyComparisons);
        if (residualUpdateChecks.length > 0) {
          console.log(
            'Residual update possibility checks (assumes pendingOrderAmounts did not increase after auto-roll):',
          );
          console.table(residualUpdateChecks);
        }
        console.log(
          `Opposite-sign receiver transfers found: ${nettingTransfers.length}`,
        );
        if (details && nettingTransfers.length > 0) {
          console.table(nettingTransfers);
        }
      }

      if (failOnMismatch && mismatches.length > 0) {
        fail(`Found ${mismatches.length} total supply mismatch(es)`);
      }
    },
  );
