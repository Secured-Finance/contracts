```
        `-_`.         .______`
      -!1111r".    .t96/////]%991
      "1111111`   ~88(.      .T8?
      -=11111".   488!         _?
        ,"""'.    488a"_       .:
                  "d8888%x/.
                    +s#88888%C!_
                       .~/Ep8888e'
                  ,         ^e888>
                 .5           q88%
                 .ws`         q88;
                 .e85='`   `;Z84;
                   _!tt7!!!tt!_
```

# Secured Finance Contracts

Secured Finance is an **Orderbook-based Rates Trading Platform** on Ethereum to facilitate the lending and borrowing of digital assets so as to construct yield curves in the DeFi space. We're all about fixed-rate, fixed-term crypto asset lending and borrowing, made possible through our unique Zero-Coupon Bond instrument. Our protocol is implemented as a decentralized on-chain orderbook system.

## Quick Start

1. Use established node version by running `nvm use`
2. Install repository dependencies by running `npm install`
3. Run `npm run compile` to compile smart contracts
4. Execute `npm run test` to run the tests.

## Environment variables

Please refer to `.env.sample` and create `.env` to provide secret info such as private keys.
Private keys are used in order to deploy smart contracts on one of the Ethereum networks.
In addition, depending on your target chain, the native token symbol, the native wrapped token symbol, and the native wrapped token address have to be set.

## Compile

Run `npm run compile` to compile smart contracts.
To recompile everything, the command `npm run compile:force` can be used.

## Deployment

Run `npm run deploy <NETWORK>` command in order to deploy the protocol.
For example, the command will be `npm run deploy hardhat` to deploy the protocol on the local hardhat version.

To reset and redeploy the smart contracts again, the command `npm run deploy:force <NETWORK>` can be used.

## Testing

### Hardhat EVM testing

1. Run `npm run test` to run all tests from `./test` directory in a local hardhat javascript EVM.

### On-chain ganache testing

1. Run `npx hardhat node` or `npm run ganache` to start a local blockchain node
2. Execute `npx hardhat test --network localhost` to run tests on a local blockchain node

In order to run the specified script, the command will be `npx hardhat --network <NETWORK> test "<SCRIPT PATH>"`.
For example, the command will be `npx hardhat --network development test "scripts/zc-e2e.ts"` to execute the `zc-e2e` script on the develop environment.

### Security Tool testing

#### How to run Mythril locally

1. Run `npm run flatten`
2. Run `npm run security:mythril`
3. Check the generated report named `secured-finance-mythril.md` in the project root

_As of Oct 2023, Mythril version 0.23.22 is the latest working version for us_

#### How to run Slither Analyzer locally

1. Build the docker image `docker build -t sf-slither --platform linux/amd64 -f Dockerfile.slither .`
2. Run `npm run flatten`
3. Run `npm run security:slither`
4. Check the generated report named `secured-finance-slither.txt` in the project root

Note: You can change the target python, solc, and slither analyzer version in the `Dockerfile.slither`.

_As of Oct 2023, Slither will refer to the flatten contracts rather than ones in `build`. This might affect the slither behavior: generating duplicated messages, etc._

## Publishing

This package is published by GitHub actions. Versioning is executed as follows

```
In case that current version is 0.0.1
-> prerelease: 0.0.2-beta.0
-> patch: 0.0.2

In case that current version is 0.0.1-beta.0
-> prerelease: 0.0.1-beta.1
-> patch: 0.0.1
```

## Tasks

Under the `tasks` folder, there are the scripts below, which are executed using the Hardhat task.

| Task Name        | Description                                              | Example of use                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| add-currency     | Add a new currency                                       | `npx hardhat add-currency --network mainnet --currency USDC --haircut 0 --price-feeds "0x6da4D9E53AADF92ABb2e23FFCf8b099FeF08AB84" --heartbeats 86400 --token-address 0x839440dfF4160a8e8373d641f768741c3f3c9932 --is-collateral true` |
| add-order-books  | Add new order books                                      | `npx hardhat add-order-books --network mainnet --currency USDC --opening-date 1696464000 --pre-opening-date 1702598400`                                                                                                                |
| change-owners    | Change owners of all contracts to the new owner          | `npx hardhat change-owners --network mainnet`                                                                                                                                                                                          |
| fork             | Create a fork chain using Tenderly's API                 | `npm run fork mainnet`                                                                                                                                                                                                                 |
| unfork           | Delete a forked chain                                    | `npm run unfork 8238aaaf-bb5a-41b6-8b3d-8c6b1e064a6db98423a5-431c-4fbc-a0cc-3c70fad0500c`                                                                                                                                              |
| open-markets     | Execute Itayose calls and auto-rolls to open the markets | `npx hardhat open-markets --network mainnet`                                                                                                                                                                                           |
| register-orders  | Register sample orders in the selected order book.       | `npx hardhat register-orders --network mainnet --collateral-currency USDC --market-currency ETH --maturity 1684316920 --mid-unit-price 9000 --amount 100000000000000000000 --order-count 5`                                            |
| verify-contracts | Verify and register contracts on Etherscan.              | `npx hardhat verify-contracts --network mainnet`                                                                                                                                                                                       |

## Documents

Run `npm run docgen` in order to generate documents.

The following documents are automatically generated by the code generator under the [./docs](./docs) folder from Solidity comments.

| Core Contracts                                                            |
| ------------------------------------------------------------------------- |
| [AddressResolver.sol](./docs/protocol/AddressResolver.md)                 |
| [BeaconProxyController.sol](./docs/protocol/BeaconProxyController.md)     |
| [CurrencyController.sol](./docs/protocol/CurrencyController.md)           |
| [FutureValueVault.sol](./docs/protocol/FutureValueVault.md)               |
| [GenesisValueVault.sol](./docs/protocol/GenesisValueVault.md)             |
| [LendingMarket.sol](./docs/protocol/LendingMarket.md)                     |
| [LendingMarketController.sol](./docs/protocol/LendingMarketController.md) |
| [ProxyController.sol](./docs/protocol/ProxyController.md)                 |
| [ReserveFund.sol](./docs/protocol/ReserveFund.md)                         |
| [TokenVault.sol](./docs/protocol/TokenVault.md)                           |
| [ZCToken.sol](./docs/protocol/ZCToken.md)                                 |

| External Contracts                                                                   |
| ------------------------------------------------------------------------------------ |
| [LendingMarketReader.sol](./docs/external/webapp/LendingMarketReader.md)             |
| [Liquidator.sol](./docs/external/liquidation/Liquidator.md)                          |
| [ItayoseCallResolver.sol](./docs/external/gelato/ItayoseCallResolver.md)             |
| [OrderBookRotationResolver.sol](./docs/external/gelato/OrderBookRotationResolver.md) |

## Audits

You can find all audit reports under the audits folder

- [Quantstamp | Nov 2023](./audits/2023-11-Quantstamp.pdf)
- [Quantstamp | Mar 2024](./audits/2024-03-Quantstamp.pdf)
