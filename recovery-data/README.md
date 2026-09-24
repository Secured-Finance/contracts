# Order-book incident recovery data

The recovery task reads one reviewed JSON file from
`recovery-data/<network>/<currency>.json`, where `network` is the network name
defined in `hardhat.config.ts`.

Run a recovery with both the Hardhat network and the recovery data key:

```bash
npx hardhat recover-user-funds \
  --network mainnet \
  --currency USDC
```

Recovery data is currently provided for `mainnet`, `arbitrum-one`, and
`filecoin-mainnet`.

Each file contains all correction batches for one network and currency. A batch
groups all maturities for one user because Deposit is maintained per user and
currency. BORROW corrections must precede LEND corrections so that Deposit
credits are applied before Deposit debits.

IDs can be reproduced from the source CSV with these preimages:

```text
correctionId = keccak256(
  utf8("order-book-incident-recovery:<network>:<currency>:correction:<disappearanceId>")
)
batchId = keccak256(
  utf8("order-book-incident-recovery:<network>:<currency>:batch:<lowercase-user>")
)
```

`fundingAmount` is the non-negative net TokenVault token balance decrease
recorded in `fundingTransactions`, not the gross disappeared BORROW amount or
gross withdrawals. Each transaction records its hash and the TokenVault token
balance immediately before and after execution:

```text
netOutflow = sum(tokenVaultBalanceBefore - tokenVaultBalanceAfter)
fundingAmount = max(0, netOutflow)
```

A balance increase contributes a negative value. This is required when one
batch combines multiple incident transactions, as in the Filecoin FIL recovery.
The recovery task verifies this calculation before generating any calls.

Before each correction batch, the recovery contract cancels every active LEND
and BORROW order belonging to the affected user in the selected currency.
Consequently, active orders are not listed in the execution JSON and require no
additional Deposit funding.

`retainedLendPositions` lists normally executed LEND positions that remain
after the erroneous fills are offset. Their original raw PV is funded so the
recovery can preserve those positions while applying the LEND corrections.
Each entry records its source transaction and log index, maturity, raw PV
amount, and the net FV retained after fees. The amount passed to the recovery
contract is therefore:

```text
executionFundingAmount = fundingAmount
                       + sum(retainedLendPositions.amount)
```

An empty `retainedLendPositions` array explicitly records that the batch has no
executed LEND positions requiring additional funding. `fundingAmount` continues
to equal the observed TokenVault net outflow; additional LEND funding must not
be represented as a synthetic funding transaction.

Set the destination recovery account at execution time with
`RECOVERY_RECEIVER_ADDRESS`. After every correction batch has completed, the
task derives the unique affected users from `batches[].user`. For each user, the
Controller enumerates every used maturity and transfers the complete signed FV
balance to the Receiver. Positive LEND and negative BORROW positions are both
transferred, so no position list or expected FV is maintained in the execution
JSON. The destination is a controlled recovery account and does not need to
satisfy protocol collateral coverage.

Before execution:

- deploy `OrderBookIncidentRecovery`;
- grant it the Controller Operator role and, for correction batches, the
  TokenVault Operator role using separately reviewed multisig transactions;
- keep every affected LendingMarket paused until its recovery is complete;
- ensure TokenVault is paused;
- fund the executing account and review every generated call;
- set and independently verify `RECOVERY_RECEIVER_ADDRESS`; and
- verify user Deposit/FV state and TokenVault balances after each currency.

`LendingMarket.executeAutoRoll` is disabled while that market is paused.
Therefore, recovery may run after the maturity timestamp as long as the order
book remains unrotated: verify that its order book ID and maturity are unchanged
and that `GenesisValueVault.isAutoRolled(currency, maturity)` is `false`. Do not
run this recovery flow if the target order book has already been rotated or
auto-rolled.

With `ENABLE_AUTO_UPDATE=true`, calls are executed by the configured deployer.
Otherwise the task creates the normal Safe or FVM proposal. ERC-20 calls are
ordered as allowance reset, approval, correction, and allowance cleanup. Native
funding is attached to `executeCorrections` as transaction value.

## Fork execution test

The fork test deploys and upgrades FutureValueVault, the Controller, and
LendingMarket through the existing deployment scripts, deploys
`OrderBookIncidentRecovery`, grants its required operator roles by impersonating
the on-chain administrators, invokes the actual `recover-user-funds` task, and
validates the result. It intentionally does not change the protocol pause state
or fund the recovery Receiver. The test is skipped unless
`RUN_RECOVERY_FORK_TEST=true`.

Start an Anvil fork at the reviewed block while preserving the source chain ID.
For Filecoin USDFC, whose recovery evidence was calculated at block `6351734`:

```bash
anvil \
  --fork-url "$FILECOIN_ARCHIVE_RPC" \
  --fork-block-number 6351734 \
  --chain-id 314 \
  --auto-impersonate
```

After starting the fork, run the test through the production Hardhat network
name, not `localhost`. The setup uses the first local account as the recovery
owner and resolves the protocol administrators from the fork. TokenVault and
the target LendingMarket must already be paused. Set
`RECOVERY_TEST_RECEIVER_ADDRESS` to the controlled recovery account used by the
test; collateral coverage is not required. The test verifies that affected
users have no active orders, FV or GV positions, or Deposit after execution and
that all signed positions and remaining Deposit were moved to this Receiver.

```bash
FORK_RPC_ENDPOINT=http://127.0.0.1:8545 \
USE_DEFAULT_ACCOUNTS=true \
ENABLE_AUTO_UPDATE=true \
NATIVE_CURRENCY_SYMBOL=FIL \
RUN_RECOVERY_FORK_TEST=true \
RECOVERY_TEST_CURRENCY=USDFC \
RECOVERY_TEST_TOKEN_HOLDER_ADDRESS=<reviewed-usdfc-holder> \
RECOVERY_TEST_RECEIVER_ADDRESS=<controlled-recovery-receiver> \
npx hardhat test test/fork/order-book-incident-recovery.fork.test.ts --network filecoin-mainnet
```

The first local account is the executor and funding source. The test gives it
enough native balance automatically. For an ERC-20 recovery,
`RECOVERY_TEST_TOKEN_HOLDER_ADDRESS` identifies an account on the fork from
which the executor's funding shortfall can be transferred. The test does not
change the receiver's collateral because the recovery flow intentionally
permits the controlled account to remain undercollateralized.

The test checks:

- Deposit, FV and `pendingOrderAmounts` changes calculated from the manifest;
- TokenVault's real token balance and `totalDepositAmount`;
- execution flags and recovery events for every reviewed ID;
- zero retained recovery balance and zero ERC-20 allowance;
- unchanged order-book IDs, maturities and non-auto-rolled state;
- continued LendingMarket and TokenVault pause state; and
- for each asset transfer, exact full-position movement, zero remaining user
  Deposit, consistent supplies and total Deposit, receiver registration, and
  recorded coverage state.

# Current storage gap

```
# Ethereum
┌─────────┬──────────┬────────────┬─────────────┬─────────────────────────────┬───────────────────────────┬─────────────────────────────┬─────────┬───────────┐
│ (index) │ currency │ maturity   │ orderBookId │ totalInactiveOrderAmount    │ pendingOrderAmount        │ gap                         │ isMatch │ userCount │
├─────────┼──────────┼────────────┼─────────────┼─────────────────────────────┼───────────────────────────┼─────────────────────────────┼─────────┼───────────┤
│ 0       │ 'USDC'   │ 1790294400 │ 11          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 1       │ 'USDC'   │ 1798156800 │ 12          │ '2000000'                   │ '2000000'                 │ '0'                         │ true    │ 2         │
│ 2       │ 'USDC'   │ 1806019200 │ 13          │ '3510000000'                │ '9999994'                 │ '3500000006'                │ false   │ 4         │
│ 3       │ 'USDC'   │ 1813881600 │ 14          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 4       │ 'USDC'   │ 1821744000 │ 15          │ '5000000'                   │ '5000000'                 │ '0'                         │ true    │ 1         │
│ 5       │ 'USDC'   │ 1830211200 │ 16          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 6       │ 'USDC'   │ 1838073600 │ 17          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 7       │ 'USDC'   │ 1845936000 │ 18          │ '16015000000'               │ '999997'                  │ '16014000003'               │ false   │ 3         │
│ 8       │ 'USDC'   │ 1853798400 │ 19          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 9       │ 'ETH'    │ 1790294400 │ 11          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 10      │ 'ETH'    │ 1798156800 │ 12          │ '1000000000000000'          │ '1000000000000000'        │ '0'                         │ true    │ 1         │
│ 11      │ 'ETH'    │ 1806019200 │ 13          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 12      │ 'ETH'    │ 1813881600 │ 14          │ '419050090368760267'        │ '17499999999999999'       │ '401550090368760268'        │ false   │ 3         │
│ 13      │ 'ETH'    │ 1821744000 │ 15          │ '400050090368761263'        │ '500000000000997'         │ '399550090368760266'        │ false   │ 2         │
│ 14      │ 'ETH'    │ 1830211200 │ 16          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 15      │ 'ETH'    │ 1838073600 │ 17          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 16      │ 'ETH'    │ 1845936000 │ 18          │ '4510000000000000000'       │ '997'                     │ '4509999999999999003'       │ false   │ 3         │
│ 17      │ 'ETH'    │ 1853798400 │ 19          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 18      │ 'WBTC'   │ 1790294400 │ 11          │ '10000'                     │ '10000'                   │ '0'                         │ true    │ 1         │
│ 19      │ 'WBTC'   │ 1798156800 │ 12          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 20      │ 'WBTC'   │ 1806019200 │ 13          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 21      │ 'WBTC'   │ 1813881600 │ 14          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 22      │ 'WBTC'   │ 1821744000 │ 15          │ '10000'                     │ '10000'                   │ '0'                         │ true    │ 1         │
│ 23      │ 'WBTC'   │ 1830211200 │ 16          │ '90100000'                  │ '997'                     │ '90099003'                  │ false   │ 2         │
│ 24      │ 'WBTC'   │ 1838073600 │ 17          │ '10000'                     │ '10000'                   │ '0'                         │ true    │ 1         │
│ 25      │ 'WBTC'   │ 1845936000 │ 18          │ '1291959'                   │ '19997'                   │ '1271962'                   │ false   │ 3         │
│ 26      │ 'WBTC'   │ 1853798400 │ 19          │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
│ 27      │ 'JPYC'   │ 1790294400 │ 4           │ '8503737809485606533178136' │ '999999999999999996'      │ '8503736809485606533178140' │ false   │ 8         │
│ 28      │ 'JPYC'   │ 1798156800 │ 5           │ '10000000000000000000000'   │ '10000000000000000000000' │ '0'                         │ true    │ 1         │
│ 29      │ 'JPYC'   │ 1806019200 │ 6           │ '0'                         │ '0'                       │ '0'                         │ true    │ 0         │
└─────────┴──────────┴────────────┴─────────────┴─────────────────────────────┴───────────────────────────┴─────────────────────────────┴─────────┴───────────┘

# Arbitrum
┌─────────┬──────────┬────────────┬─────────────┬──────────────────────────┬─────────────────────┬──────────────────────┬─────────┬───────────┐
│ (index) │ currency │ maturity   │ orderBookId │ totalInactiveOrderAmount │ pendingOrderAmount  │ gap                  │ isMatch │ userCount │
├─────────┼──────────┼────────────┼─────────────┼──────────────────────────┼─────────────────────┼──────────────────────┼─────────┼───────────┤
│ 0       │ 'USDC'   │ 1790294400 │ 11          │ '1000000'                │ '1000000'           │ '0'                  │ true    │ 1         │
│ 1       │ 'USDC'   │ 1798156800 │ 12          │ '20000000'               │ '20000000'          │ '0'                  │ true    │ 1         │
│ 2       │ 'USDC'   │ 1806019200 │ 13          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 3       │ 'USDC'   │ 1813881600 │ 14          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 4       │ 'USDC'   │ 1821744000 │ 15          │ '5000000'                │ '5000000'           │ '0'                  │ true    │ 1         │
│ 5       │ 'USDC'   │ 1830211200 │ 16          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 6       │ 'USDC'   │ 1838073600 │ 17          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 7       │ 'USDC'   │ 1845936000 │ 18          │ '7157308926'             │ '2000997'           │ '7155307929'         │ false   │ 4         │
│ 8       │ 'USDC'   │ 1853798400 │ 19          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 9       │ 'ETH'    │ 1790294400 │ 11          │ '66000000000000000'      │ '66000000000000000' │ '0'                  │ true    │ 1         │
│ 10      │ 'ETH'    │ 1798156800 │ 12          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 11      │ 'ETH'    │ 1806019200 │ 13          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 12      │ 'ETH'    │ 1813881600 │ 14          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 13      │ 'ETH'    │ 1821744000 │ 15          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 14      │ 'ETH'    │ 1830211200 │ 16          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 15      │ 'ETH'    │ 1838073600 │ 17          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 16      │ 'ETH'    │ 1845936000 │ 18          │ '447756520518574407'     │ '1500000000000997'  │ '446256520518573410' │ false   │ 3         │
│ 17      │ 'ETH'    │ 1853798400 │ 19          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 18      │ 'WBTC'   │ 1790294400 │ 11          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 19      │ 'WBTC'   │ 1798156800 │ 12          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 20      │ 'WBTC'   │ 1806019200 │ 13          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 21      │ 'WBTC'   │ 1813881600 │ 14          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 22      │ 'WBTC'   │ 1821744000 │ 15          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 23      │ 'WBTC'   │ 1830211200 │ 16          │ '10000'                  │ '10000'             │ '0'                  │ true    │ 1         │
│ 24      │ 'WBTC'   │ 1838073600 │ 17          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
│ 25      │ 'WBTC'   │ 1845936000 │ 18          │ '902464'                 │ '20997'             │ '881467'             │ false   │ 4         │
│ 26      │ 'WBTC'   │ 1853798400 │ 19          │ '0'                      │ '0'                 │ '0'                  │ true    │ 0         │
└─────────┴──────────┴────────────┴─────────────┴──────────────────────────┴─────────────────────┴──────────────────────┴─────────┴───────────┘

# Filecoin
┌─────────┬──────────┬────────────┬─────────────┬───────────────────────────┬──────────────────────────┬───────────────────────────┬─────────┬───────────┐
│ (index) │ currency │ maturity   │ orderBookId │ totalInactiveOrderAmount  │ pendingOrderAmount       │ gap                       │ isMatch │ userCount │
├─────────┼──────────┼────────────┼─────────────┼───────────────────────────┼──────────────────────────┼───────────────────────────┼─────────┼───────────┤
│ 0       │ 'USDFC'  │ 1790294400 │ 6           │ '1150000000000000000000'  │ '1049000000000000000000' │ '101000000000000000000'   │ false   │ 2         │
│ 1       │ 'USDFC'  │ 1798156800 │ 7           │ '28991179578346855450263' │ '999999999999999996'     │ '28990179578346855450267' │ false   │ 2         │
│ 2       │ 'USDFC'  │ 1806019200 │ 8           │ '0'                       │ '0'                      │ '0'                       │ true    │ 0         │
│ 3       │ 'FIL'    │ 1790294400 │ 9           │ '2000000000000000000'     │ '2000000000000000000'    │ '0'                       │ true    │ 1         │
│ 4       │ 'FIL'    │ 1798156800 │ 10          │ '8121027851988696232939'  │ '6918979111008477821'    │ '8114108872877687755118'  │ false   │ 3         │
│ 5       │ 'FIL'    │ 1806019200 │ 11          │ '0'                       │ '0'                      │ '0'                       │ true    │ 0         │
└─────────┴──────────┴────────────┴─────────────┴───────────────────────────┴──────────────────────────┴───────────────────────────┴─────────┴───────────┘

```
