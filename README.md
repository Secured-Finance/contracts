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

To compile smart contracts, type `npm run compile`. Use `npm run compile:force` command to recompile everyting if needed.

The compiled output is a json file called Artifacts and saved in `./build/contracts` directory per contract basis.
ABI and bytecode associated with the smart contract will be saved in the json file.

## Deployment

In order to deploy the protocol please execute `npm run deploy <NETWORK>` command and replace with the network you want to deploy the protocol.

For example `npm run deploy hardhat` will deploy the protocol on the local hardhat version of the ethereum blockchain.

After the successful deployment you'll be able to find the deployment result in the deployments folder.

In case you want to reset and redeploy again, you can use the command `npm run deploy:force <NETWORK>`.

## Testing

### Hardhat EVM testing

1. Run `npm run test` to run all tests from `./test` directory in a local hardhat javascript EVM.

### On-chain ganache testing

1. Run `npx hardhat node` or `npm run ganache` to start a local blockchain node
2. Execute `npx hardhat test --network localhost` to run tests on a local blockchain node

## Hardhat Scripts

In order to run the specified script, execute `npm run script <NETWORK> <SCRIPT PATH>` command due to run a script in the `./scripts` directory.

For example `npm run script develop ./scripts/loan-test.js` will execute the `loan-test` script on the develop environment.

## Deployed smart contracts

## Rinkeby testnet

| Smart Contract                                                          | Address                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [PaymentAggregator](/contracts/PaymentAggregator.sol)                   | [0x7b97B03C3232a6560d6C9daAaE49f33037D9131C](https://rinkeby.etherscan.io/address/0x7b97B03C3232a6560d6C9daAaE49f33037D9131C) |
| [CloseOutNetting](/contracts/CloseOutNetting.sol)                       | [0x759C97C1a517388a1cB779833C7a035E37684995](https://rinkeby.etherscan.io/address/0x759C97C1a517388a1cB779833C7a035E37684995) |
| [CurrencyController](/contracts/CurrencyController.sol)                 | [0x2938Fcec0Ba1633a35692Fd0863a2dCe6D8F6b33](https://rinkeby.etherscan.io/address/0x2938Fcec0Ba1633a35692Fd0863a2dCe6D8F6b33) |
| [FIL/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)             | [0xa052130e0Fc959d16DC2DF0ccF4cCa84B7606Ae6](https://rinkeby.etherscan.io/address/0xa052130e0Fc959d16DC2DF0ccF4cCa84B7606Ae6) |
| [ETH/USD price feed](/contracts/mocks/MockV3Aggregator.sol)             | [0x0b65C5DCf31d8FB6D53983a664182d3ad06aeB21](https://rinkeby.etherscan.io/address/0x0b65C5DCf31d8FB6D53983a664182d3ad06aeB21) |
| [BTC/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)             | [0x764f8D238cE06087e2DDdbD3A8A3fd0CbEF4FF9B](https://rinkeby.etherscan.io/address/0x764f8D238cE06087e2DDdbD3A8A3fd0CbEF4FF9B) |
| [CollateralAggregatorV2](/contracts/CollateralAggregatorV2.sol)         | [0xC616D55499aacE74cFC3005061b07d239bB22125](https://rinkeby.etherscan.io/address/0xC616D55499aacE74cFC3005061b07d239bB22125) |
| [CrosschainAddressResolver](/contracts/CrosschainAddressResolver.sol)   | [0x10f1B36AD1F8Fd0FACfaDBfeb78535F082868060](https://rinkeby.etherscan.io/address/0x10f1B36AD1F8Fd0FACfaDBfeb78535F082868060) |
| [ETH Collateral Vault](/contracts/CollateralVault.sol)                  | [0xB210Cf89241B86FEB80bBd6209972BD3cb325914](https://rinkeby.etherscan.io/address/0xB210Cf89241B86FEB80bBd6209972BD3cb325914) |
| [WETH token](/contracts/mocks/WETH9Mock.sol)                            | [0xcA0beb0d6F2e5759ebFeB7b70818C2891cdC4e48](https://rinkeby.etherscan.io/address/0xcA0beb0d6F2e5759ebFeB7b70818C2891cdC4e48) |
| [DealId library](/contracts/libraries/DealId.sol)                       | [0x7296b5194f4E140B2d64Ec967285e007d9880365](https://rinkeby.etherscan.io/address/0x7296b5194f4E140B2d64Ec967285e007d9880365) |
| [QuickSort library](/contracts/libraries/QuickSort.sol)                 | [0xccc71122dAe468F3B629e88DC349974281dbD914](https://rinkeby.etherscan.io/address/0xccc71122dAe468F3B629e88DC349974281dbD914) |
| [DiscountFactor library](/contracts/libraries/DiscountFactor.sol)       | [0xa46bcE9eB2DbD0C76A6C4c7F581BdfC57A59c96F](https://rinkeby.etherscan.io/address/0xa46bcE9eB2DbD0C76A6C4c7F581BdfC57A59c96F) |
| [ProductAddressResolver](/contracts/ProductAddressResolver.sol)         | [0xB0D4b6A17E71F19f198859Ff6f04a9883bad2E01](https://rinkeby.etherscan.io/address/0xB0D4b6A17E71F19f198859Ff6f04a9883bad2E01) |
| [TermStructure](/contracts/TermStructure.sol)                           | [0xE1f4BF0E576f79edf5376A2cC82396E92157AbDC](https://rinkeby.etherscan.io/address/0xE1f4BF0E576f79edf5376A2cC82396E92157AbDC) |
| [Liquidations](/contracts/Liquidations.sol)                             | [0x154d96EC4Ad6942539ad46288d8dd3c024C6Bbe9](https://rinkeby.etherscan.io/address/0x154d96EC4Ad6942539ad46288d8dd3c024C6Bbe9) |
| [LoanV2](/contracts/LoanV2.sol)                                         | [0x2A7DCcB9856241430628331869A7d37DB37305B9](https://rinkeby.etherscan.io/address/0x2A7DCcB9856241430628331869A7d37DB37305B9) |
| [LendingMarketController](/contracts/LendingMarketController.sol)       | [0x64F373a1D03CFd8300a2b8B525C4350A0158e34b](https://rinkeby.etherscan.io/address/0x64F373a1D03CFd8300a2b8B525C4350A0158e34b) |
| [MarkToMarket](/contracts/MarkToMarket.sol)                             | [0xAd07541C73F0911726Fe64227D12f799e667Bb15](https://rinkeby.etherscan.io/address/0xAd07541C73F0911726Fe64227D12f799e667Bb15) |
| [SettlementEngine](/contracts/SettlementEngine.sol)                     | [0x604BC283e44389549733751Fb9bcfBbcbD89E47a](https://rinkeby.etherscan.io/address/0x604BC283e44389549733751Fb9bcfBbcbD89E47a) |
| [OracleOperator](/contracts/Operator.sol)                               | [0x04A909955AcF331Ca73066bfc3c0F490cd2908e3](https://rinkeby.etherscan.io/address/0x04A909955AcF331Ca73066bfc3c0F490cd2908e3) |
| [ChainlinkSettlementAdapter](/contracts/ChainlinkSettlementAdapter.sol) | [0xEA103561aB3c058629aA48D0e5922089529Ca86A](https://rinkeby.etherscan.io/address/0xEA103561aB3c058629aA48D0e5922089529Ca86A) |

Lending markets:

| Smart Contract                                | Address                                                                                                                       | Term    | Currency |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x412e5fd69305a0B5dfE949FBfE2464958F6bCfe3](https://rinkeby.etherscan.io/address/0x412e5fd69305a0B5dfE949FBfE2464958F6bCfe3) | 3 month | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0xF53D59B639cdD9A9e949986E6960F0Db04A94EbE](https://rinkeby.etherscan.io/address/0xF53D59B639cdD9A9e949986E6960F0Db04A94EbE) | 6 month | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x80f604Ba89164295fA246768C96CdD8E5f17577E](https://rinkeby.etherscan.io/address/0x80f604Ba89164295fA246768C96CdD8E5f17577E) | 1 year  | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x6735ee886b39f124F37544238D0a9d1A036F26a2](https://rinkeby.etherscan.io/address/0x6735ee886b39f124F37544238D0a9d1A036F26a2) | 2 years | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x325545412158ba3Ddcd2d67c9E23B2D4CB600521](https://rinkeby.etherscan.io/address/0x325545412158ba3Ddcd2d67c9E23B2D4CB600521) | 3 years | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x0b2B5f157a7cd0F03908f58B3d795Ae4E83003CC](https://rinkeby.etherscan.io/address/0x0b2B5f157a7cd0F03908f58B3d795Ae4E83003CC) | 5 years | FIL      |
