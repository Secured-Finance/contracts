// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IFutureValueVault {
    error UserIsZero();
    error PastMaturityBalanceExists(address user);
    error TotalSupplyNotZero();
    error InvalidResetAmount();
    error InsufficientBalance();
    error InsufficientLockedBalance();

    event Transfer(
        address indexed from,
        address indexed to,
        uint8 orderBookId,
        uint256 maturity,
        int256 value
    );
    event BalanceLocked(
        uint8 indexed orderBookId,
        uint256 indexed maturity,
        address indexed user,
        uint256 value
    );
    event BalanceUnlocked(
        uint8 indexed orderBookId,
        uint256 indexed maturity,
        address indexed user,
        uint256 value
    );

    function getTotalLendingSupply(uint256 maturity) external view returns (uint256);

    function getTotalBorrowingSupply(uint256 maturity) external view returns (uint256);

    function getBalance(
        uint8 orderBookId,
        address user
    ) external view returns (int256 futureValue, uint256 maturity);

    function getTotalLockedBalance(uint8 orderBookId) external view returns (uint256);

    function hasBalanceAtPastMaturity(
        uint8 orderBookId,
        address user,
        uint256 maturity
    ) external view returns (bool);

    function increase(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external;

    function decrease(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external;

    function lock(
        uint8 orderBookId,
        address user,
        uint256 amount,
        uint256 maturity
    ) external returns (uint256 lockedAmount);

    function unlock(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external;

    function transferFrom(
        uint8 orderBookId,
        address sender,
        address receiver,
        int256 amount,
        uint256 maturity
    ) external;

    function reset(
        uint8 orderBookId,
        address user
    )
        external
        returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved);

    function executeForcedReset(uint8 orderBookId, address user) external;

    function executeForcedReset(
        uint8 orderBookId,
        address user,
        int256 amount
    ) external returns (int256 removedAmount, int256 balance);
}
