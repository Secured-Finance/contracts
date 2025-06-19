# Solidity API

## ParasailWPFILAggregator

### wpfil

```solidity
contract IWPFIL wpfil
```

### aggregator

```solidity
contract IParasailAggregator aggregator
```

### constructor

```solidity
constructor(address _aggregator, address _wpfil) public
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

### description

```solidity
function description() public pure returns (string)
```

### version

```solidity
function version() public pure returns (uint256)
```

### latestAnswer

```solidity
function latestAnswer() public view returns (int256)
```

### latestTimestamp

```solidity
function latestTimestamp() public view returns (uint256)
```

### latestRound

```solidity
function latestRound() public view returns (uint256)
```

### getAnswer

```solidity
function getAnswer(uint256) public view returns (int256)
```

### getTimestamp

```solidity
function getTimestamp(uint256) external view returns (uint256)
```

### getRoundData

```solidity
function getRoundData(uint80 _roundId) public view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### latestRoundData

```solidity
function latestRoundData() public view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

