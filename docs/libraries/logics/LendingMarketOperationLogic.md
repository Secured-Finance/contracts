# Solidity API

## LendingMarketOperationLogic

### initializeCurrencySetting

```solidity
function initializeCurrencySetting(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor) external
```

### createLendingMarket

```solidity
function createLendingMarket(bytes32 _ccy, uint256 _openingDate) external returns (address market, address futureValueVault, uint256 maturity)
```

### executeMultiItayoseCall

```solidity
function executeMultiItayoseCall(bytes32[] _currencies, uint256 _maturity) external
```

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 _ccy, uint256 _autoRollFeeRate) external returns (uint256 fromMaturity, uint256 toMaturity)
```

