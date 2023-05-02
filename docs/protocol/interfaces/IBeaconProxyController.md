# Solidity API

## IBeaconProxyController

### BeaconProxyCreated

```solidity
event BeaconProxyCreated(bytes32 id, address proxyAddress, address implementationAddress)
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
function deployLendingMarket(bytes32 ccy, uint256 maturity, uint256 openingDate) external returns (address market)
```

