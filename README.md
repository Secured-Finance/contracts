# Secured Finance Protocol

The [Secured Finance](https://secured-finance.com/) protocol is institutional-grade peer-to-peer derivatives exchange with automatic collateral management and built-in mark-to-market mechanisms. The protocol is designed to replicate [40-years](<https://en.wikipedia.org/wiki/Swap_(finance)#History>) of knowledge of an industry-standard that manages [558 trillion dollars of OTC (i.e., peer-to-peer) interest-rate derivative transactions](https://stats.bis.org/statx/srs/table/d5.1) and made the interbank market system open to the public. The range of products on Secured Finance markets starts with loans, interest rate swaps, and expands to other types of interest-rate products.

**Disclaimer:** Secured Finance is not an intermediary service provider, nor a custodian; it is a decentralized protocol developer. Since this is a peer-to-peer platform, the ownership of funds and private keys remain on users; therefore, financial activity and decision making such as funds transfer, sending confirmations are to be made solely by users.

This repository contains the core smart contracts of the Secured Finance Protocol, as well as a testing environment to set up a protocol localy.

## Quick Start

1. Use established node version by running `nvm use`
2. Install repository dependencies by running `npm install`
3. Run `npm run compile` to compile smart contracts
4. Execute `npm run test` to run the tests.

## Smart Contracts

Contracts written in Solidity are stored in `./contracts` directory.

## Environment variables

Please refer to `.env.sample` and create `.env` to provide secret info such as private keys, Infura ID.
Private keys are used in order to deploy smart contracts on one of the Ethereum networks.

## Compile

Run `npm run compile` to compile smart contracts. Use `npm run compile:force` command to recompile everyting if needed.

The compiled output is a json file called Artifacts and saved in `./build/contracts` directory per contract basis.
ABI and bytecode associated with the smart contract will be saved in the json file.

## Deployment

In order to deploy the protocol, run `npm run deploy <NETWORK>` command and replace with the network you want to deploy the protocol.

For example `npm run deploy hardhat` will deploy the protocol on the local hardhat version of the ethereum blockchain.

After the successful deployment you'll be able to find the deployment result in the deployments folder.

In case you want to reset and redeploy again, you can use the command `npm run deploy:force <NETWORK>`.

## Testing

### Hardhat EVM testing

1. Run `npm run test` to run all tests from `./test` directory in a local hardhat javascript EVM.

### On-chain ganache testing

1. Run `npx hardhat node` or `npm run ganache` to start a local blockchain node
2. Execute `npx hardhat test --network localhost` to run tests on a local blockchain node

In order to run the specified script, execute `npx hardhat --network <NETWORK> test "<SCRIPT PATH>"`.

For example `npx hardhat --network development test "scripts/zc-e2e.ts"` will execute the `zc-e2e` script on the develop environment.

## Publishing

This package is published automatically by workflows when the PR is merged into develop branch or main branch. The package version will be updated by the workflow.
Versioning is executed as follows

```
In case that current version is 0.0.1
-> After merging into develop: 0.0.2-beta.0
-> After merging into main: 0.0.2

In case that current version is 0.0.1-beta.0
-> After merging into develop: 0.0.1-beta.1
-> After merging into main: 0.0.1
```

If you want to update the major version or minor version, you need to update it manually.

## Tasks

Under the task folder, there are the scripts below which are run using the Hardhat task.

| Task Name       | Description                                                           | Example of use                                                                                                                                         |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| fork            | Create a fork chain using Tenderly's API                              | `npm run fork development`                                                                                                                             |
| unfork          | Delete a forked chain                                                 | `npm run unfork b98423a5-431c-4fbc-a0cc-3c70fad0500c`                                                                                                  |
| register-orders | Register order data into the selected market in the selected currency | `npx hardhat register-orders --network localhost --currency FIL --maturity 1669856400 --mid-rate 70000 --amount 10000000000000000000 --order-count 10` |

## Documents

In order to generate documents, run `npm run docgen`.

The following documents are automatically generated by the code generator from Solidity comments under the [./docs](./docs) folder.

| Contract Name                                                    |
| ---------------------------------------------------------------- |
| [AddressResolver.sol](./docs/AddressResolver.md)                 |
| [BeaconProxyController.sol](./docs/BeaconProxyController.md)     |
| [CurrencyController.sol](./docs/CurrencyController.md)           |
| [FutureValueVault.sol](./docs/FutureValueVault.md)               |
| [LendingMarket.sol](./docs/LendingMarket.md)                     |
| [LendingMarketController.sol](./docs/LendingMarketController.md) |
| [ProxyController.sol](./docs/ProxyController.md)                 |
| [TokenVault.sol](./docs/TokenVault.md)                           |
