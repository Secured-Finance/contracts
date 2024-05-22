# Solidity API

## PythAggregator

This contract always uses the price publish time as the round id,
as pyth network does not have a concept of rounds.

### priceId

```solidity
bytes32 priceId
```

### pyth

```solidity
contract IPyth pyth
```

### description

```solidity
string description
```

### constructor

```solidity
constructor(address _pyth, bytes32 _priceId, string _description) public
```

### updateFeeds

```solidity
function updateFeeds(bytes[] priceUpdateData) public payable
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

### version

```solidity
function version() public pure returns (uint256)
```

### latestAnswer

```solidity
function latestAnswer() public view virtual returns (int256)
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
function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### latestRoundData

```solidity
function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

