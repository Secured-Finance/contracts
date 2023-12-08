# Solidity API

## IBeaconProxyController

### NoBeaconProxyContract

```solidity
error NoBeaconProxyContract()
```

### InvalidProxyContract

```solidity
error InvalidProxyContract()
```

### BeaconProxyUpdated

```solidity
event BeaconProxyUpdated(bytes32 id, address proxyAddress, address newImplementationAddress, address oldImplementationAddress)
```

### getBeaconProxyAddress

```solidity
function getBeaconProxyAddress(bytes32 beaconName) external view returns (address)
```

### setFutureValueVaultImpl

```solidity
function setFutureValueVaultImpl(address newImpl) external
```

### setLendingMarketImpl

```solidity
function setLendingMarketImpl(address newImpl) external
```

### deployFutureValueVault

```solidity
function deployFutureValueVault() external returns (address futureValueVault)
```

### deployLendingMarket

```solidity
function deployLendingMarket(bytes32 ccy, uint256 orderFeeRate, uint256 cbLimitRange) external returns (address market)
```

