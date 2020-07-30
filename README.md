# Secured Finance Smart Contracts

This contains Solidity smartcontracts to deploy to Ethereum network using Truffle framework or Web3.js.

## Quick Start

1. Set environment variables in `.env` file
2. type `truffle compile`, `truffle develop` and then `migrate --reset`
3. type `npm test` to interact with a pre-deployed smart contract.

## Smart Contracts

Contracts written in Solidity will be placed in `./contracts` directory. (see truffle-config.js to modify the directory)

- Migrations.sol: This is provided by Truffle and used for deployment by `truffle migrate`.
- Market.sol: This file contains MoneyMarket contract and FXMarket contract.
- Collateral.sol: This is a collateral manager.
- Loan.sol: This is a template for a loan contract. (TBD)

## Environment variables

Please refer to `.env.sample` and create `.env` to provide secret info such as private keys, Infura ID.

## Compile

To compile smart contracts, type `truffle compile`. Use `--all` option to recompile everyting if needed.

The compiled output is a json file called Artifacts and saved in `./contracts` directory. (Hello.token.json. See truffle-config.js to modify the directory) ABI and bytecode will be saved in the json file.

## Deploy

There are two ways to deploy. By A) Truffle or B) Web3.js.

### A) Truffle

1. `truffle develop` to launch local network. (see truffle-config.js to modify the host `127.0.0.1:9545`)

2. `migrate` to deploy smartcontracts specified in `./migrations/2_deploy_contracts.js`.

### B) Web3.js

A sample test file `./test/web3Test.ts` is provided. It uses `./src/services/web3/web3.service.ts` library.

The web3.service is created to deploy smart contracts, send transactions, and interact with smart contracts.
