# Order-book incident residual recovery data

`<network>/order-book-incident-residual.json` is the reviewed input for the
residual order-tree recovery on that chain. The same file is consumed by the
execution task and the fork test.

Each residual-tree entry fixes one paused `LendingMarket` side. The contract
checks the supplied root, order IDs, prices, makers, amounts and empty maker
order arrays before changing storage. Filecoin additionally contains the one
USDFC partial fill that must be reversed through
`OrderBookIncidentFillRecovery`.

Create a Safe proposal:

```sh
npx hardhat recover-incident-residual-orders --network mainnet
npx hardhat recover-incident-residual-orders --network arbitrum-one
npx hardhat recover-incident-residual-orders --network filecoin-mainnet
```

`SAFE_WALLET_ADDRESS` must be the approved execution Safe and the owner of
`LendingMarketController`. On Filecoin, the deployed
`OrderBookIncidentFillRecovery` must also be owned by that Safe and have
`OPERATOR_ROLE` on both `LendingMarketController` and `TokenVault`.

For a disposable fork only, set `ENABLE_AUTO_UPDATE=true` to execute directly
from `SAFE_WALLET_ADDRESS` instead of submitting a proposal. The fork must make
that address available as an unlocked or impersonated signer and fund it for
gas. The fork test does this after installing the reviewed implementations and
recovery permissions.

Run the fork test against a fork RPC endpoint:

```sh
RUN_RECOVERY_FORK_TEST=true \
USE_DEFAULT_ACCOUNTS=true \
FORK_RPC_ENDPOINT=http://127.0.0.1:8545 \
npx hardhat test test/fork/order-book-incident-residual-recovery.fork.test.ts \
  --network mainnet
```

Use `arbitrum-one` or `filecoin-mainnet` for the other manifests. The fork must
start at or after the manifest's `referenceBlock`.

Check one residual order-book side before or after execution:

```sh
FORK_RPC_ENDPOINT=http://127.0.0.1:8545 \
npx hardhat check-incident-residual-orders \
  --network filecoin-mainnet \
  --currency USDFC \
  --maturity 1798156800 \
  --side BORROW
```

The result is `NOT_RECOVERED` while price levels remain and `COMPLETED` when
the selected side is empty.

Check the Filecoin order-fill reversal using its recovery ID:

```sh
FORK_RPC_ENDPOINT=http://127.0.0.1:8545 \
INCIDENT_FILL_RECOVERY_ADDRESS=<address shown by the fork test> \
npx hardhat check-incident-order-fill-reversal \
  --network filecoin-mainnet \
  --recovery-id 0x513d5a3ffaf74ba783507c6505477940f79507149261835611a241508db324d2
```

This result is derived only from the execution flag, the taker and maker
Deposit/FV balances, and the recovery events. Protocol pause state and
temporary permissions are intentionally outside the check.
`INCIDENT_FILL_RECOVERY_ADDRESS` is required because the fork test does not
persist an `OrderBookIncidentFillRecovery` deployment file. Use the deployment
address printed by the fork test. Environment variables placed before the
fork-test command apply only to that command, so specify `FORK_RPC_ENDPOINT`
again when running a separate check command.
