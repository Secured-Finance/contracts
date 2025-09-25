# Changelog

## [1.4.0](https://github.com/Secured-Finance/contracts/compare/v1.3.0...v1.4.0) (2025-09-25)


### Features

* add estimation and unwind functions by fv [SF-1456] ([24f21dd](https://github.com/Secured-Finance/contracts/commit/24f21dd47fc7778f04048af3f227227fc6416e21))
* add issue templates and update configs [SF-1438] ([a5d76e2](https://github.com/Secured-Finance/contracts/commit/a5d76e2b61cc7db47b3c400edde3103d15ea392e))
* add tempolary function to recover user funds [SF-1435] ([21ce3fd](https://github.com/Secured-Finance/contracts/commit/21ce3fd01cff821f29c2a1175e9bef7bf40864cd))
* add tempolary function to recover user funds [SF-1435] ([495ee41](https://github.com/Secured-Finance/contracts/commit/495ee4126014793445b1b839595715e658d29c2c))


### Bug Fixes

* fix ILendingMarket [SF-1456] ([c1867c3](https://github.com/Secured-Finance/contracts/commit/c1867c3b360e33e1a783f2d475f852436b2da003))
* fix order estimation bug [SF-1421] ([c48de48](https://github.com/Secured-Finance/contracts/commit/c48de48f75b3651b6391ff896a8b8c91bd7c9ca9))
* fix tree rotation issue [SF-1435] ([02d5041](https://github.com/Secured-Finance/contracts/commit/02d5041429438046365ef8e6f94a8feb16b4cd9b))
* remove tmp function [SF-1435] ([ede7bad](https://github.com/Secured-Finance/contracts/commit/ede7bad8e80bdd13c1b7e1414553ba4a69d5bfa5))
* remove tmp function for bug fix [SF-1435] ([06c7a05](https://github.com/Secured-Finance/contracts/commit/06c7a05843860559e7db2eedd8457698eef60701))

## [1.3.0](https://github.com/Secured-Finance/contracts/compare/v1.2.0...v1.3.0) (2025-06-13)


### Features

* add StaticPriceAggregator [SF-1340] ([c363d36](https://github.com/Secured-Finance/contracts/commit/c363d36c1b8d161f5b17ea19d630d6715ca88ac4))
* add wpFIL [SF-1300] ([52ef22a](https://github.com/Secured-Finance/contracts/commit/52ef22aa18e211b86860a0259fc933e2df25e51f))


### Bug Fixes

* fix deposit bug in Liquidator [SF-1376] ([99ce28b](https://github.com/Secured-Finance/contracts/commit/99ce28bc40fb2018c807353746168065bcd12c34))
* fix gv lazy evaluation bug [SF-1407] ([4946c46](https://github.com/Secured-Finance/contracts/commit/4946c46cbfccde9b8f63fdf6470762b123a8f26c))
* fix liduidator bug [SF-1376] ([f6983e3](https://github.com/Secured-Finance/contracts/commit/f6983e33f2b5bbbdfd4719f77f62f25a5f3da855))

## [1.2.0](https://github.com/Secured-Finance/contracts/compare/v1.1.0...v1.2.0) (2024-06-13)


### Features

* add FVM to the dev environment [SF-1112] ([a8e72f5](https://github.com/Secured-Finance/contracts/commit/a8e72f564cef6591e00693d91449c0ebf405493c))
* add new task to update pyth price feeds [SF-1112] ([cd46f25](https://github.com/Secured-Finance/contracts/commit/cd46f25b671fed909f072db7e37b9a5cc387f7a5))
* integrate FVM built-in msig [SF-1112] ([ce44ffe](https://github.com/Secured-Finance/contracts/commit/ce44ffefef5ead97dbeb8e7c487d99ff4d5a156c))
* support Filecoin Mainnet [SF-1157] ([a8f49c8](https://github.com/Secured-Finance/contracts/commit/a8f49c8765bffb6ce74dc46b4d9bd178494fb9d9))
* support iFIL as collateral [SF-1112] ([f306360](https://github.com/Secured-Finance/contracts/commit/f3063601ace7509e2305e84343b0a0f63875fcfb))


### Bug Fixes

* add error handling logic into deployment script [SF-1112] ([0b23ae7](https://github.com/Secured-Finance/contracts/commit/0b23ae74c5b94b51bdb0fbff30ebd955a82ef4bc))
* fix issues in deploy script [SF-1157] ([0c4eb4e](https://github.com/Secured-Finance/contracts/commit/0c4eb4e340967767feacdab35be36262944f99dd))

## [1.1.0](https://github.com/Secured-Finance/contracts/compare/v1.0.3...v1.1.0) (2024-04-02)


### Features

* add a new event BlockUnitPriceHistoryUpdated [SF-1062] ([0a6f66f](https://github.com/Secured-Finance/contracts/commit/0a6f66f7ee6e47a6d4f80c3e4d836537f5b8d398))
* add a tokenization functionality [SF-197] ([160685c](https://github.com/Secured-Finance/contracts/commit/160685c711e247eda36f3bb428a72a04f923dc6c))
* add full liquidation logic [SF-732] ([6c39f49](https://github.com/Secured-Finance/contracts/commit/6c39f490140fd8f9e5d42723bfc8f6fa55508d2c))
* add Polygon zkEVM in workflows [SF-1049] ([eb8371b](https://github.com/Secured-Finance/contracts/commit/eb8371b8ffac4dfd9994c34f1c0b5b84ef8c04bf))
* make Liquidator upgradeable [SF-1031] ([a412886](https://github.com/Secured-Finance/contracts/commit/a4128867b7d89b9daf2c3cc2a1806e89624c6b25))
* reduce the zc token decimals [SF-1101] ([8d7cb00](https://github.com/Secured-Finance/contracts/commit/8d7cb00d1c0ae0c280bfe845c4cfb6ed05fd5ee9))
* remove the order book reuse logic [SF-941] ([9ecaa38](https://github.com/Secured-Finance/contracts/commit/9ecaa38009db8b859af8f09e3173f4eb7b75067e))
* support erc2612 [SF-897] ([7bb56e8](https://github.com/Secured-Finance/contracts/commit/7bb56e8bf1df1067f41c8972697498cddb5e4cb0))
* update deposit flows [SF-897] ([12a5d85](https://github.com/Secured-Finance/contracts/commit/12a5d85fb8b338d012d1bdea36fdecbe5752105a))
* update Liquidator to support Uniswap V2 [SF-1031] ([99de66f](https://github.com/Secured-Finance/contracts/commit/99de66f1d6f8eafa75adf80b7a3ed4cfef45c164))


### Bug Fixes

* add min debt unit price logic into the order estimation function [SF-1054] ([ec0c00f](https://github.com/Secured-Finance/contracts/commit/ec0c00f8336b7b311d6d8742cc13f7e6a09ae1f9))
* change the estimation logic for tokenization [SF-197] ([e3a3af8](https://github.com/Secured-Finance/contracts/commit/e3a3af88c80052d4b5131e2b73397d654cb0b8bf))
* fix a liquidation amount calculation bug [SF-732] ([0f17431](https://github.com/Secured-Finance/contracts/commit/0f17431ef307c54f61f579e33044f5c89c356702))
* fix a liquidation callback function issue [SF-1053] ([4e5a153](https://github.com/Secured-Finance/contracts/commit/4e5a153b7eb22ea96c452b0e6dd4e8e26e3fb907))
* fix a publish workflow issue [SF-1091] ([96c8b42](https://github.com/Secured-Finance/contracts/commit/96c8b425b4da93d94d395e22b5c5c177a0d73432))
* fix a verify-contracts script issue [SF-1091] ([ca84f72](https://github.com/Secured-Finance/contracts/commit/ca84f7266addd0186fc69d4d6f167817e2779c6c))
* fix a zctoken decimals issue [SF-1101] ([0740768](https://github.com/Secured-Finance/contracts/commit/07407689abc610833463b093d618ddda6bf1a71c))
* fix a zctoken withdrawal issue [SF-11002] ([75be16d](https://github.com/Secured-Finance/contracts/commit/75be16d9612af0e447ca2e4410226372139b81cf))
* fix auto-roll checking logic [SF-1079] ([3dce010](https://github.com/Secured-Finance/contracts/commit/3dce01012d19cd6bc320f04a030db9fffdfb0e46))
* fix deployment issue [SF-732] ([87de4c6](https://github.com/Secured-Finance/contracts/commit/87de4c6d47ed7960a589c0d80972a42fd1ab1b54))
* fix getLendOrderIds logic issue [SF-1055] ([9aebd63](https://github.com/Secured-Finance/contracts/commit/9aebd636a4f0355cbbcf01e242d460946b8b59dc))
* fix gv issues by huge compound factor value [SF-1083] ([dcb2ae1](https://github.com/Secured-Finance/contracts/commit/dcb2ae1d7cfad74612fb57f15f119298495e98a3))
* fix lastOrderBookId overflow bug [SF-1079] ([2fe15ec](https://github.com/Secured-Finance/contracts/commit/2fe15ecba6d5a98da54360813d8ee73e4e95dabc))
* fix QS-11 [SF-1091] ([466aec1](https://github.com/Secured-Finance/contracts/commit/466aec13fe018c088f1af5d971dd9ca5619e084b))
* fix QS-14 [SF-1091] ([6df5354](https://github.com/Secured-Finance/contracts/commit/6df5354569c105bb87c106e5a7e88ab9eaae8e0a))
* fix QS-4 [SF-1091] ([a50c4b3](https://github.com/Secured-Finance/contracts/commit/a50c4b39147d482bf3e44b38281655958d531715))
* fix QS-8 [SF-1091] ([7ccb862](https://github.com/Secured-Finance/contracts/commit/7ccb862ca858e70667ed157acdbb26691c883fff))
* fix tokenization bugs [SF-197] ([243773a](https://github.com/Secured-Finance/contracts/commit/243773a837ce275dcc2dd30201bb622ab935cd42))
* fix zc token bugs [SF-197] ([a40f3e9](https://github.com/Secured-Finance/contracts/commit/a40f3e974ef5893c6a66af0643917553be0d3266))
* fix zc token names & symbols [SF-197] ([b76cc4f](https://github.com/Secured-Finance/contracts/commit/b76cc4ff6cbb8c2af6048c95721d99e6bbf0dcfd))
* update liquidation flow to support non-collateral currency [SF-914] ([6f53407](https://github.com/Secured-Finance/contracts/commit/6f534078735a08bf8472efd655ab74c0e804ce00))
