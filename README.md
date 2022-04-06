# Secured Finance Protocol

The [Secured Finance](https://secured-finance.com/) protocol is institutional-grade peer-to-peer derivatives exchange with automatic collateral management and built-in mark-to-market mechanisms. The protocol is designed to replicate [40-years](https://en.wikipedia.org/wiki/Swap_(finance)#History) of knowledge of an industry-standard that manages [558 trillion dollars of OTC (i.e., peer-to-peer) interest-rate derivative transactions](https://stats.bis.org/statx/srs/table/d5.1) and made the interbank market system open to the public. The range of products on Secured Finance markets starts with loans, interest rate swaps, and expands to other types of interest-rate products.

**Disclaimer:** Secured Finance is not an intermediary service provider, nor a custodian; it is a decentralized protocol developer. Since this is a peer-to-peer platform, the ownership of funds and private keys remain on users; therefore, financial activity and decision making such as funds transfer, sending confirmations are to be made solely by users.

This repository contains the core smart contracts of the Secured Finance Protocol, as well as a testing environment to set up a protocol localy.

## Quick Start

1. Make sure you're using Node >= 14, or use established node version by running `nvm use`
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

In order to deploy the protocol please execute `npm run deploy:<NETWORK>` command and replace with the network you want to deploy the protocol. 

For example `npm run deploy:hardhat` will deploy the protocol on the local hardhat version of the ethereum blockchain. 

After the successfull deployment you'll be able to find the deployment result in the deployments folder.

## Testing 

### Hardhat EVM testing

1. Run `npx hardhat test` to run all tests from `./test` directory in a local hardhat javascript EVM.

### On-chain ganache testing

1. Run `hardhat node` or `ganache` to start a local blockchain node
2. Execute `hardhat test --network localhost` to run tests on a local blockchain node

## Deployed smart contracts

### Ropsten testnet

| Smart Contract | Address | 
|----------------|---------|
| [PaymentAggregator](/contracts/PaymentAggregator.sol) |[0xbf5c6641ab47307F48Ca74644011B8a76e37241b](https://ropsten.etherscan.io/address/0xbf5c6641ab47307F48Ca74644011B8a76e37241b)|
|[CloseOutNetting](/contracts/CloseOutNetting.sol) |[0xB26348D051da2dd8AE9402b3E3060A48F632114e](https://ropsten.etherscan.io/address/0xB26348D051da2dd8AE9402b3E3060A48F632114e)|
|[CurrencyController](/contracts/CurrencyController.sol)|[0x8682Fa83785B7F51A14101122CCb1DCb4A247B80](https://ropsten.etherscan.io/address/0x8682Fa83785B7F51A14101122CCb1DCb4A247B80)|
|[FIL/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)|[0x7f5e8b6b2dbee8047e76d5de179e2e2538aba6b5](https://ropsten.etherscan.io/address/0x7f5e8b6b2dbee8047e76d5de179e2e2538aba6b5)|
|[ETH/USD price feed](/contracts/mocks/MockV3Aggregator.sol)|[0xe39de54070Ee59A425E35f5c5039170D2B9E4694](https://ropsten.etherscan.io/address/0xe39de54070Ee59A425E35f5c5039170D2B9E4694)|
|[BTC/ETH price feed](/contracts/mocks/MockV3Aggregator.sol)|[0x9EF623c837933ccAF3C1cee4dDd2F0e10025a938](https://ropsten.etherscan.io/address/0x9EF623c837933ccAF3C1cee4dDd2F0e10025a938)|
|[CollateralAggregatorV2](/contracts/CollateralAggregatorV2.sol)|[0x74B405Ec5dC45e5c7ea9d581D4A3907e60B724d4](https://ropsten.etherscan.io/address/0x74B405Ec5dC45e5c7ea9d581D4A3907e60B724d4)|
|[CrosschainAddressResolver](/contracts/CrosschainAddressResolver.sol)|[0x93E72CE258eB0a47aC0de06f012162afa5D84f15](https://ropsten.etherscan.io/address/0x93E72CE258eB0a47aC0de06f012162afa5D84f15)|
|[ETH Collateral Vault](/contracts/CollateralVault.sol)|[0x62E09A147445AF26EDB7a67F51AE11E09eD37407](https://ropsten.etherscan.io/address/0x62E09A147445AF26EDB7a67F51AE11E09eD37407)|
|[WETH token](/contracts/mocks/WETH9Mock.sol)|[0x088E36970FC2222b244c0480671171e7E7C3a9eA](https://ropsten.etherscan.io/address/0x088E36970FC2222b244c0480671171e7E7C3a9eA)|
|[DealId library](/contracts/libraries/DealId.sol)|[0x84BfdF9e085Ac0c3Ff9BCBC699Ce6AFAD49a3597](https://ropsten.etherscan.io/address/0x84BfdF9e085Ac0c3Ff9BCBC699Ce6AFAD49a3597)|
|[QuickSort library](/contracts/libraries/QuickSort.sol)|[0xeAE7Ee84269af9E9F6F68AF57eAd4f8EB495dB8d](https://ropsten.etherscan.io/address/0xeAE7Ee84269af9E9F6F68AF57eAd4f8EB495dB8d)|
|[DiscountFactor library](/contracts/libraries/DiscountFactor.sol)|[0x6B92F20547f8318A5f5ee2dF3947e3912f760c1B](https://ropsten.etherscan.io/address/0x6B92F20547f8318A5f5ee2dF3947e3912f760c1B)|
|[ProductAddressResolver](/contracts/ProductAddressResolver.sol)|[0x3Bb006345DA94AA05BEBD0Ec70CBe6f28A017cEe](https://ropsten.etherscan.io/address/0x3Bb006345DA94AA05BEBD0Ec70CBe6f28A017cEe)|
|[TermStructure](/contracts/TermStructure.sol)|[0xB6AD6A3a356f208832e46aF4409e59B53287E44E](https://ropsten.etherscan.io/address/0xB6AD6A3a356f208832e46aF4409e59B53287E44E)|
|[Liquidations](/contracts/Liquidations.sol)|[0xbc7595aFc5B13FC336014754E3b9567f0D0cc2e5](https://ropsten.etherscan.io/address/0xbc7595aFc5B13FC336014754E3b9567f0D0cc2e5)|
|[LoanV2](/contracts/LoanV2.sol)|[0x884254b0fc1e7bF2fE14177CFd63fd4f50a93528](https://ropsten.etherscan.io/address/0x884254b0fc1e7bF2fE14177CFd63fd4f50a93528)|
|[LendingMarketController](/contracts/LendingMarketController.sol)|[0x80143B3C92b635cF8A5892899a6634eEE731cff5](https://ropsten.etherscan.io/address/0x80143B3C92b635cF8A5892899a6634eEE731cff5)|
|[MarkToMarket](/contracts/MarkToMarket.sol)|[0x4E599754188C4772696BB9A85F435Df02275cE29](https://ropsten.etherscan.io/address/0x4E599754188C4772696BB9A85F435Df02275cE29)|

Lending markets:

| Smart Contract | Address | Term | Currency |
|----------------|---------| ---- | -------- |
|[LendingMarket](/contracts/LendingMarket.sol)|[0x0F144f72fcC41d135c34085595D57c5B2a839F20](https://ropsten.etherscan.io/address/0x0F144f72fcC41d135c34085595D57c5B2a839F20)| 3 month | FIL |
|[LendingMarket](/contracts/LendingMarket.sol)|[0xcC843f549FA27E131F76d6573F0527e07923Bd3B](https://ropsten.etherscan.io/address/0xcC843f549FA27E131F76d6573F0527e07923Bd3B)| 6 month | FIL |
|[LendingMarket](/contracts/LendingMarket.sol)|[0xcCfB4c0D6022bdE01275B4fDC8Dd9eB2909e3d2d](https://ropsten.etherscan.io/address/0xcCfB4c0D6022bdE01275B4fDC8Dd9eB2909e3d2d)| 1 year | FIL |
|[LendingMarket](/contracts/LendingMarket.sol)|[0x5FFF882062775e05B761ef79FED5217A3602BD66](https://ropsten.etherscan.io/address/0x5FFF882062775e05B761ef79FED5217A3602BD66)| 2 years | FIL |
|[LendingMarket](/contracts/LendingMarket.sol)|[0xb72aDef1b12F934cd5cE8be959C28DC4f1E60Dc7](https://ropsten.etherscan.io/address/0xb72aDef1b12F934cd5cE8be959C28DC4f1E60Dc7)| 3 years | FIL |
|[LendingMarket](/contracts/LendingMarket.sol)|[0x1723CA6fB3f9Bcd48c5aBBd8d393CE58aAa0c8F3](https://ropsten.etherscan.io/address/0x1723CA6fB3f9Bcd48c5aBBd8d393CE58aAa0c8F3)| 5 years | FIL |
