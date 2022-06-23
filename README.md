# Secured Finance Protocol

The [Secured Finance](https://secured-finance.com/) protocol is institutional-grade peer-to-peer derivatives exchange with automatic collateral management and built-in mark-to-market mechanisms. The protocol is designed to replicate [40-years](<https://en.wikipedia.org/wiki/Swap_(finance)#History>) of knowledge of an industry-standard that manages [558 trillion dollars of OTC (i.e., peer-to-peer) interest-rate derivative transactions](https://stats.bis.org/statx/srs/table/d5.1) and made the interbank market system open to the public. The range of products on Secured Finance markets starts with loans, interest rate swaps, and expands to other types of interest-rate products.

**Disclaimer:** Secured Finance is not an intermediary service provider, nor a custodian; it is a decentralized protocol developer. Since this is a peer-to-peer platform, the ownership of funds and private keys remain on users; therefore, financial activity and decision making such as funds transfer, sending confirmations are to be made solely by users.

This repository contains the core smart contracts of the Secured Finance Protocol, as well as a testing environment to set up a protocol localy.

## Quick Start

1. Use established node version by running `nvm use`
2. Install repository dependencies by running `npm install`
3. Run `hardhat compile` to compile smart contracts
4. Execute `hardhat test` to run the tests.

## Smart Contracts

Contracts written in Solidity are stored in `./contracts` directory.

## Environment variables

Please refer to `.env.sample` and create `.env` to provide secret info such as private keys, Infura ID.
Private keys are used in order to deploy smart contracts on one of the Ethereum networks.

## Compile

To compile smart contracts, type `hardhat compile`. Use `--force` option to recompile everyting if needed.

The compiled output is a json file called Artifacts and saved in `./build/contracts` directory per contract basis.
ABI and bytecode associated with the smart contract will be saved in the json file.

## Deployment

In order to deploy the protocol please execute `npm run deploy <NETWORK>` command and replace with the network you want to deploy the protocol.

For example `npm run deploy hardhat` will deploy the protocol on the local hardhat version of the ethereum blockchain.

After the successful deployment you'll be able to find the deployment result in the deployments folder.

In case you want to reset and redeploy again, you can use the command `npm run deploy:force <NETWORK>`.

## Testing

### Hardhat EVM testing

1. Run `npx hardhat test` to run all tests from `./test` directory in a local hardhat javascript EVM.

### On-chain ganache testing

1. Run `hardhat node` or `ganache` to start a local blockchain node
2. Execute `hardhat test --network localhost` to run tests on a local blockchain node

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

## Ropsten testnet

| Smart Contract                                                        | Address                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [PaymentAggregator](/contracts/PaymentAggregator.sol)                 | [0xbf5c6641ab47307F48Ca74644011B8a76e37241b](https://ropsten.etherscan.io/address/0xbf5c6641ab47307F48Ca74644011B8a76e37241b) |
| [CloseOutNetting](/contracts/CloseOutNetting.sol)                     | [0xB26348D051da2dd8AE9402b3E3060A48F632114e](https://ropsten.etherscan.io/address/0xB26348D051da2dd8AE9402b3E3060A48F632114e) |
| [CurrencyController](/contracts/CurrencyController.sol)               | [0x8682Fa83785B7F51A14101122CCb1DCb4A247B80](https://ropsten.etherscan.io/address/0x8682Fa83785B7F51A14101122CCb1DCb4A247B80) |
| [FIL/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)           | [0x7f5e8b6b2dbee8047e76d5de179e2e2538aba6b5](https://ropsten.etherscan.io/address/0x7f5e8b6b2dbee8047e76d5de179e2e2538aba6b5) |
| [ETH/USD price feed](/contracts/mocks/MockV3Aggregator.sol)           | [0xe39de54070Ee59A425E35f5c5039170D2B9E4694](https://ropsten.etherscan.io/address/0xe39de54070Ee59A425E35f5c5039170D2B9E4694) |
| [BTC/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)           | [0x9EF623c837933ccAF3C1cee4dDd2F0e10025a938](https://ropsten.etherscan.io/address/0x9EF623c837933ccAF3C1cee4dDd2F0e10025a938) |
| [CollateralAggregatorV2](/contracts/CollateralAggregatorV2.sol)       | [0x74B405Ec5dC45e5c7ea9d581D4A3907e60B724d4](https://ropsten.etherscan.io/address/0x74B405Ec5dC45e5c7ea9d581D4A3907e60B724d4) |
| [CrosschainAddressResolver](/contracts/CrosschainAddressResolver.sol) | [0x93E72CE258eB0a47aC0de06f012162afa5D84f15](https://ropsten.etherscan.io/address/0x93E72CE258eB0a47aC0de06f012162afa5D84f15) |
| [ETH Collateral Vault](/contracts/CollateralVault.sol)                | [0x62E09A147445AF26EDB7a67F51AE11E09eD37407](https://ropsten.etherscan.io/address/0x62E09A147445AF26EDB7a67F51AE11E09eD37407) |
| [WETH token](/contracts/mocks/WETH9Mock.sol)                          | [0x088E36970FC2222b244c0480671171e7E7C3a9eA](https://ropsten.etherscan.io/address/0x088E36970FC2222b244c0480671171e7E7C3a9eA) |
| [DealId library](/contracts/libraries/DealId.sol)                     | [0x84BfdF9e085Ac0c3Ff9BCBC699Ce6AFAD49a3597](https://ropsten.etherscan.io/address/0x84BfdF9e085Ac0c3Ff9BCBC699Ce6AFAD49a3597) |
| [QuickSort library](/contracts/libraries/QuickSort.sol)               | [0xeAE7Ee84269af9E9F6F68AF57eAd4f8EB495dB8d](https://ropsten.etherscan.io/address/0xeAE7Ee84269af9E9F6F68AF57eAd4f8EB495dB8d) |
| [DiscountFactor library](/contracts/libraries/DiscountFactor.sol)     | [0x6B92F20547f8318A5f5ee2dF3947e3912f760c1B](https://ropsten.etherscan.io/address/0x6B92F20547f8318A5f5ee2dF3947e3912f760c1B) |
| [ProductAddressResolver](/contracts/ProductAddressResolver.sol)       | [0x3Bb006345DA94AA05BEBD0Ec70CBe6f28A017cEe](https://ropsten.etherscan.io/address/0x3Bb006345DA94AA05BEBD0Ec70CBe6f28A017cEe) |
| [TermStructure](/contracts/TermStructure.sol)                         | [0xB6AD6A3a356f208832e46aF4409e59B53287E44E](https://ropsten.etherscan.io/address/0xB6AD6A3a356f208832e46aF4409e59B53287E44E) |
| [Liquidations](/contracts/Liquidations.sol)                           | [0xbc7595aFc5B13FC336014754E3b9567f0D0cc2e5](https://ropsten.etherscan.io/address/0xbc7595aFc5B13FC336014754E3b9567f0D0cc2e5) |
| [LoanV2](/contracts/LoanV2.sol)                                       | [0x884254b0fc1e7bF2fE14177CFd63fd4f50a93528](https://ropsten.etherscan.io/address/0x884254b0fc1e7bF2fE14177CFd63fd4f50a93528) |
| [LendingMarketController](/contracts/LendingMarketController.sol)     | [0x80143B3C92b635cF8A5892899a6634eEE731cff5](https://ropsten.etherscan.io/address/0x80143B3C92b635cF8A5892899a6634eEE731cff5) |
| [MarkToMarket](/contracts/MarkToMarket.sol)                           | [0x4E599754188C4772696BB9A85F435Df02275cE29](https://ropsten.etherscan.io/address/0x4E599754188C4772696BB9A85F435Df02275cE29) |

Lending markets:

| Smart Contract                                | Address                                                                                                                       | Term    | Currency |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x0F144f72fcC41d135c34085595D57c5B2a839F20](https://ropsten.etherscan.io/address/0x0F144f72fcC41d135c34085595D57c5B2a839F20) | 3 month | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0xcC843f549FA27E131F76d6573F0527e07923Bd3B](https://ropsten.etherscan.io/address/0xcC843f549FA27E131F76d6573F0527e07923Bd3B) | 6 month | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0xcCfB4c0D6022bdE01275B4fDC8Dd9eB2909e3d2d](https://ropsten.etherscan.io/address/0xcCfB4c0D6022bdE01275B4fDC8Dd9eB2909e3d2d) | 1 year  | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x5FFF882062775e05B761ef79FED5217A3602BD66](https://ropsten.etherscan.io/address/0x5FFF882062775e05B761ef79FED5217A3602BD66) | 2 years | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0xb72aDef1b12F934cd5cE8be959C28DC4f1E60Dc7](https://ropsten.etherscan.io/address/0xb72aDef1b12F934cd5cE8be959C28DC4f1E60Dc7) | 3 years | FIL      |
| [LendingMarket](/contracts/LendingMarket.sol) | [0x1723CA6fB3f9Bcd48c5aBBd8d393CE58aAa0c8F3](https://ropsten.etherscan.io/address/0x1723CA6fB3f9Bcd48c5aBBd8d393CE58aAa0c8F3) | 5 years | FIL      |
