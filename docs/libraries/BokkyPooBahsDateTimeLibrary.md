# Solidity API

## BokkyPooBahsDateTimeLibrary

### SECONDS_PER_DAY

```solidity
uint256 SECONDS_PER_DAY
```

### SECONDS_PER_HOUR

```solidity
uint256 SECONDS_PER_HOUR
```

### SECONDS_PER_MINUTE

```solidity
uint256 SECONDS_PER_MINUTE
```

### OFFSET19700101

```solidity
int256 OFFSET19700101
```

### DOW_MON

```solidity
uint256 DOW_MON
```

### DOW_TUE

```solidity
uint256 DOW_TUE
```

### DOW_WED

```solidity
uint256 DOW_WED
```

### DOW_THU

```solidity
uint256 DOW_THU
```

### DOW_FRI

```solidity
uint256 DOW_FRI
```

### DOW_SAT

```solidity
uint256 DOW_SAT
```

### DOW_SUN

```solidity
uint256 DOW_SUN
```

### _daysFromDate

```solidity
function _daysFromDate(uint256 year, uint256 month, uint256 day) internal pure returns (uint256 _days)
```

### _daysToDate

```solidity
function _daysToDate(uint256 _days) internal pure returns (uint256 year, uint256 month, uint256 day)
```

### timestampFromDate

```solidity
function timestampFromDate(uint256 year, uint256 month, uint256 day) internal pure returns (uint256 timestamp)
```

### timestampFromDateTime

```solidity
function timestampFromDateTime(uint256 year, uint256 month, uint256 day, uint256 hour, uint256 minute, uint256 second) internal pure returns (uint256 timestamp)
```

### timestampToDate

```solidity
function timestampToDate(uint256 timestamp) internal pure returns (uint256 year, uint256 month, uint256 day)
```

### timestampToDateTime

```solidity
function timestampToDateTime(uint256 timestamp) internal pure returns (uint256 year, uint256 month, uint256 day, uint256 hour, uint256 minute, uint256 second)
```

### isValidDate

```solidity
function isValidDate(uint256 year, uint256 month, uint256 day) internal pure returns (bool valid)
```

### isValidDateTime

```solidity
function isValidDateTime(uint256 year, uint256 month, uint256 day, uint256 hour, uint256 minute, uint256 second) internal pure returns (bool valid)
```

### isLeapYear

```solidity
function isLeapYear(uint256 timestamp) internal pure returns (bool leapYear)
```

### _isLeapYear

```solidity
function _isLeapYear(uint256 year) internal pure returns (bool leapYear)
```

### isWeekDay

```solidity
function isWeekDay(uint256 timestamp) internal pure returns (bool weekDay)
```

### isWeekEnd

```solidity
function isWeekEnd(uint256 timestamp) internal pure returns (bool weekEnd)
```

### getDaysInMonth

```solidity
function getDaysInMonth(uint256 timestamp) internal pure returns (uint256 daysInMonth)
```

### _getDaysInMonth

```solidity
function _getDaysInMonth(uint256 year, uint256 month) internal pure returns (uint256 daysInMonth)
```

### getDayOfWeek

```solidity
function getDayOfWeek(uint256 timestamp) internal pure returns (uint256 dayOfWeek)
```

### getYear

```solidity
function getYear(uint256 timestamp) internal pure returns (uint256 year)
```

### getMonth

```solidity
function getMonth(uint256 timestamp) internal pure returns (uint256 month)
```

### getDay

```solidity
function getDay(uint256 timestamp) internal pure returns (uint256 day)
```

### getHour

```solidity
function getHour(uint256 timestamp) internal pure returns (uint256 hour)
```

### getMinute

```solidity
function getMinute(uint256 timestamp) internal pure returns (uint256 minute)
```

### getSecond

```solidity
function getSecond(uint256 timestamp) internal pure returns (uint256 second)
```

### addYears

```solidity
function addYears(uint256 timestamp, uint256 _years) internal pure returns (uint256 newTimestamp)
```

### addMonths

```solidity
function addMonths(uint256 timestamp, uint256 _months) internal pure returns (uint256 newTimestamp)
```

### addDays

```solidity
function addDays(uint256 timestamp, uint256 _days) internal pure returns (uint256 newTimestamp)
```

### addHours

```solidity
function addHours(uint256 timestamp, uint256 _hours) internal pure returns (uint256 newTimestamp)
```

### addMinutes

```solidity
function addMinutes(uint256 timestamp, uint256 _minutes) internal pure returns (uint256 newTimestamp)
```

### addSeconds

```solidity
function addSeconds(uint256 timestamp, uint256 _seconds) internal pure returns (uint256 newTimestamp)
```

### subYears

```solidity
function subYears(uint256 timestamp, uint256 _years) internal pure returns (uint256 newTimestamp)
```

### subMonths

```solidity
function subMonths(uint256 timestamp, uint256 _months) internal pure returns (uint256 newTimestamp)
```

### subDays

```solidity
function subDays(uint256 timestamp, uint256 _days) internal pure returns (uint256 newTimestamp)
```

### subHours

```solidity
function subHours(uint256 timestamp, uint256 _hours) internal pure returns (uint256 newTimestamp)
```

### subMinutes

```solidity
function subMinutes(uint256 timestamp, uint256 _minutes) internal pure returns (uint256 newTimestamp)
```

### subSeconds

```solidity
function subSeconds(uint256 timestamp, uint256 _seconds) internal pure returns (uint256 newTimestamp)
```

### diffYears

```solidity
function diffYears(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _years)
```

### diffMonths

```solidity
function diffMonths(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _months)
```

### diffDays

```solidity
function diffDays(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _days)
```

### diffHours

```solidity
function diffHours(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _hours)
```

### diffMinutes

```solidity
function diffMinutes(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _minutes)
```

### diffSeconds

```solidity
function diffSeconds(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _seconds)
```

## BokkyPooBahsDateTimeLibrary

