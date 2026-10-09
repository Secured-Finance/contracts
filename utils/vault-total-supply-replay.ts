const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type Supply = {
  lending: bigint;
  borrowing: bigint;
};

type ReplayEventBase = {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  balanceGroup: string;
};

export type TransferReplayEvent = ReplayEventBase & {
  kind: 'transfer';
  supplyScope: string;
  from: string;
  to: string;
  value: bigint;
};

export type LockedReplayEvent = ReplayEventBase & {
  kind: 'lock' | 'unlock';
  user: string;
  value: bigint;
};

export type VaultReplayEvent = TransferReplayEvent | LockedReplayEvent;

export type NettingTransfer = {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  supplyScope: string;
  balanceGroup: string;
  from: string;
  to: string;
  value: bigint;
  senderBalanceBefore: bigint;
  receiverBalanceBefore: bigint;
  receiverBalanceAfter: bigint;
  offsetAmount: bigint;
  lendingDelta: bigint;
  borrowingDelta: bigint;
};

export type VaultReplayResult = {
  supplies: Map<string, Supply>;
  balances: Map<string, bigint>;
  lockedBalances: Map<string, bigint>;
  nettingTransfers: NettingTransfer[];
};

export type ChainPosition = {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
};

export type ResidualUpdateAssessmentStatus =
  | 'NOT_AUTO_ROLLED'
  | 'BLOCKED_BY_INFLATED_TOTALS'
  | 'PENDING_ORDERS_REMAIN'
  | 'POSSIBLE';

export type ResidualUpdateAssessment = {
  residualUpdatePossible: boolean;
  status: ResidualUpdateAssessmentStatus;
  nettingTransfersBeforeAutoRoll: boolean | null;
  reason: string;
};

const emptySupply = (): Supply => ({ lending: 0n, borrowing: 0n });

const abs = (value: bigint): bigint => (value >= 0n ? value : -value);

const min = (left: bigint, right: bigint): bigint =>
  left < right ? left : right;

const balanceKey = (group: string, user: string): string =>
  `${group}:${user.toLowerCase()}`;

const getBalance = (
  balances: Map<string, bigint>,
  group: string,
  user: string,
): bigint => balances.get(balanceKey(group, user)) ?? 0n;

const setBalance = (
  balances: Map<string, bigint>,
  group: string,
  user: string,
  value: bigint,
): void => {
  balances.set(balanceKey(group, user), value);
};

/**
 * Mirrors FutureValueVault._updateTotalSupply and
 * GenesisValueVault._updateTotalSupply.
 */
export const updateTotalSupply = (
  supply: Supply,
  amount: bigint,
  balance: bigint,
): void => {
  if (amount >= 0n) {
    if (balance >= 0n) {
      supply.lending += amount;
    } else {
      const diff = amount + balance;
      if (diff >= 0n) {
        supply.lending += diff;
        supply.borrowing -= -balance;
      } else {
        supply.borrowing -= amount;
      }
    }
  } else {
    const absoluteAmount = -amount;
    if (balance <= 0n) {
      supply.borrowing += absoluteAmount;
    } else {
      const diff = amount + balance;
      if (diff <= 0n) {
        supply.borrowing += -diff;
        supply.lending -= balance;
      } else {
        supply.lending -= absoluteAmount;
      }
    }
  }

  if (supply.lending < 0n || supply.borrowing < 0n) {
    throw new Error(
      `Replayed total supply became negative: lending=${supply.lending}, borrowing=${supply.borrowing}`,
    );
  }
};

const compareEvents = (left: VaultReplayEvent, right: VaultReplayEvent) =>
  left.blockNumber - right.blockNumber ||
  left.transactionIndex - right.transactionIndex ||
  left.logIndex - right.logIndex;

const comparePositions = (left: ChainPosition, right: ChainPosition): number =>
  left.blockNumber - right.blockNumber ||
  left.transactionIndex - right.transactionIndex ||
  left.logIndex - right.logIndex;

/**
 * Determines whether updateGenesisValueWithResidualAmount could have been
 * selected for a maturity. A positive pending amount excludes the branch
 * under the protocol invariant that pendingOrderAmounts never increases after
 * auto-roll. When inflated totals already existed before auto-roll,
 * FutureValueVault.reset cannot report isAllRemoved either.
 */
export const assessResidualUpdatePossibility = ({
  isAutoRolled,
  pendingOrderAmount,
  supplyIsInflated,
  nettingTransferPositions,
  autoRollPosition,
}: {
  isAutoRolled: boolean;
  pendingOrderAmount: bigint;
  supplyIsInflated: boolean;
  nettingTransferPositions: ChainPosition[];
  autoRollPosition?: ChainPosition;
}): ResidualUpdateAssessment => {
  const nettingTransfersBeforeAutoRoll =
    autoRollPosition && nettingTransferPositions.length > 0
      ? nettingTransferPositions.every(
          (position) => comparePositions(position, autoRollPosition) < 0,
        )
      : null;

  if (!isAutoRolled) {
    return {
      residualUpdatePossible: false,
      status: 'NOT_AUTO_ROLLED',
      nettingTransfersBeforeAutoRoll,
      reason:
        'convertFutureValueToGenesisValue returns before resetting FV while the maturity is not auto-rolled.',
    };
  }

  if (supplyIsInflated && nettingTransfersBeforeAutoRoll) {
    return {
      residualUpdatePossible: false,
      status: 'BLOCKED_BY_INFLATED_TOTALS',
      nettingTransfersBeforeAutoRoll,
      reason:
        'The FV totals were already inflated before auto-roll, so removed supplies cannot equal the stored totals.',
    };
  }

  if (pendingOrderAmount > 0n) {
    return {
      residualUpdatePossible: false,
      status: 'PENDING_ORDERS_REMAIN',
      nettingTransfersBeforeAutoRoll,
      reason:
        'pendingOrderAmounts is non-zero. This excludes the residual branch if it did not increase after auto-roll.',
    };
  }

  return {
    residualUpdatePossible: true,
    status: 'POSSIBLE',
    nettingTransfersBeforeAutoRoll,
    reason:
      'The maturity is auto-rolled and pendingOrderAmounts is zero; call traces or removed-supply reconstruction are required to prove execution.',
  };
};

/**
 * Reconstructs balances and the total supplies that the fixed vault logic
 * should have produced from the vault's Transfer/BalanceLocked/
 * BalanceUnlocked events.
 */
export const replayVaultEvents = (
  inputEvents: VaultReplayEvent[],
): VaultReplayResult => {
  const supplies = new Map<string, Supply>();
  const balances = new Map<string, bigint>();
  const lockedBalances = new Map<string, bigint>();
  const nettingTransfers: NettingTransfer[] = [];

  const events = [...inputEvents].sort(compareEvents);

  for (const event of events) {
    if (event.kind !== 'transfer') {
      const balance = getBalance(balances, event.balanceGroup, event.user);
      const lockedBalance = lockedBalances.get(event.balanceGroup) ?? 0n;

      if (event.kind === 'lock') {
        setBalance(
          balances,
          event.balanceGroup,
          event.user,
          balance - event.value,
        );
        lockedBalances.set(event.balanceGroup, lockedBalance + event.value);
      } else {
        setBalance(
          balances,
          event.balanceGroup,
          event.user,
          balance + event.value,
        );
        const nextLockedBalance = lockedBalance - event.value;
        if (nextLockedBalance < 0n) {
          throw new Error(
            `Replayed locked balance became negative for ${event.balanceGroup}`,
          );
        }
        lockedBalances.set(event.balanceGroup, nextLockedBalance);
      }
      continue;
    }

    const supply = supplies.get(event.supplyScope) ?? emptySupply();
    supplies.set(event.supplyScope, supply);

    const from = event.from.toLowerCase();
    const to = event.to.toLowerCase();
    const senderBalance = getBalance(balances, event.balanceGroup, from);
    const receiverBalance = getBalance(balances, event.balanceGroup, to);

    if (from === ZERO_ADDRESS) {
      updateTotalSupply(supply, event.value, receiverBalance);
      setBalance(
        balances,
        event.balanceGroup,
        to,
        receiverBalance + event.value,
      );
      continue;
    }

    if (to === ZERO_ADDRESS) {
      // reset/executeForcedReset intentionally do not update total supplies.
      setBalance(
        balances,
        event.balanceGroup,
        from,
        senderBalance - event.value,
      );
      continue;
    }

    const lendingBefore = supply.lending;
    const borrowingBefore = supply.borrowing;

    // Both calls use balances captured before either balance is changed.
    updateTotalSupply(supply, -event.value, senderBalance);
    updateTotalSupply(supply, event.value, receiverBalance);

    setBalance(
      balances,
      event.balanceGroup,
      from,
      from === to ? senderBalance : senderBalance - event.value,
    );
    if (from !== to) {
      setBalance(
        balances,
        event.balanceGroup,
        to,
        receiverBalance + event.value,
      );
    }

    const receiverHasOppositeSign =
      (event.value > 0n && receiverBalance < 0n) ||
      (event.value < 0n && receiverBalance > 0n);

    if (receiverHasOppositeSign) {
      nettingTransfers.push({
        blockNumber: event.blockNumber,
        transactionIndex: event.transactionIndex,
        logIndex: event.logIndex,
        transactionHash: event.transactionHash,
        supplyScope: event.supplyScope,
        balanceGroup: event.balanceGroup,
        from: event.from,
        to: event.to,
        value: event.value,
        senderBalanceBefore: senderBalance,
        receiverBalanceBefore: receiverBalance,
        receiverBalanceAfter: receiverBalance + event.value,
        offsetAmount: min(abs(event.value), abs(receiverBalance)),
        lendingDelta: supply.lending - lendingBefore,
        borrowingDelta: supply.borrowing - borrowingBefore,
      });
    }
  }

  return { supplies, balances, lockedBalances, nettingTransfers };
};
