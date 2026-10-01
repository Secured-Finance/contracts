# Vault total-supply recovery data

The `recover-vault-total-supplies` task reads one reviewed JSON file from:

```text
recovery-data/<network>/<currency>.json
```

`network` must be the Hardhat network name and `currency` is lowercase in the
file name. Each correction contains the over-counted amount and the historical
transfers that contributed to it. A maturity of `0` targets
`GenesisValueVault`; any other maturity targets `FutureValueVault`.

The task validates the network, chain ID, currency, unique maturities, source
transaction hashes, and that the source offset amounts sum to the correction
amount. It also checks the live vault totals and simulates the complete call
before creating or executing one atomic Controller `multicall`.

Before recovery, pause the affected LendingMarket and independently verify the
manifest against the output of `check-vault-total-supplies`. Keeping the market
paused prevents `cleanUpOrders` from performing the last FV-to-GV conversion
during the correction. The recovery task does not change the pause state.

Without `ENABLE_AUTO_UPDATE=true`, the task creates the normal Safe or FVM
proposal:

```bash
npx hardhat recover-vault-total-supplies \
  --network arbitrum-one \
  --currency USDC
```

With `ENABLE_AUTO_UPDATE=true`, the task executes the multicall directly. This
mode is intended for controlled environments such as the fork test. The task
uses the configured deployer on a live network and the impersonated Controller
owner when `FORK_RPC_ENDPOINT` is set.

## Fork test

The fork test upgrades `GenesisValueVault`, `FutureValueVault`,
`LendingMarketController`, and `LendingMarket` with the current implementations,
pauses the affected market when necessary, invokes the actual recovery task,
and verifies every total-supply delta from the manifest. It is skipped unless
`RUN_VAULT_TOTAL_SUPPLY_RECOVERY_FORK_TEST=true`.

Run the test through the production Hardhat network name so the task selects
the correct manifest. The fork must preserve the source chain ID.

```bash
FORK_RPC_ENDPOINT=http://127.0.0.1:8545 \
USE_DEFAULT_ACCOUNTS=true \
ENABLE_AUTO_UPDATE=true \
RUN_VAULT_TOTAL_SUPPLY_RECOVERY_FORK_TEST=true \
RECOVERY_TEST_CURRENCY=USDC \
npx hardhat test \
  test/fork/vault-total-supply-recovery.fork.test.ts \
  --network arbitrum-one
```

Recovery is intentionally a one-time operation. After execution, rerun
`check-vault-total-supplies`, independently confirm that all mismatches are
resolved, and remove the temporary correction functions and the temporary
`cleanUpOrders` pause guard in a subsequent deployment.
