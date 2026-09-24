# Solidity API

## UpgradeabilityBeaconProxy

### constructor

```solidity
constructor(address _beacon, bytes _data) public payable
```

### ifAdmin

```solidity
modifier ifAdmin()
```

### changeAdmin

```solidity
function changeAdmin(address newAdmin) external
```

### admin

```solidity
function admin() external view returns (address)
```

### implementation

```solidity
function implementation() external view returns (address)
```

