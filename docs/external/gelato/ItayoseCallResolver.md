# Solidity API

## ItayoseCallResolver

Implements a resolver contract of Gelato for the `executeItayoseCall` function.

The Gelato task will call the `checker` function to check if the `executeItayoseCall` function can be executed.

### constructor

```solidity
constructor(address _resolver) public
```

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### checker

```solidity
function checker(bytes32 _ccy) external view returns (bool canExec, bytes execPayload)
```

