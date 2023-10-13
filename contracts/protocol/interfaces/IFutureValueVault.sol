// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IFutureValueVault {
    error UserIsZero();
    error PastMaturityBalanceExists(address user);
    error TotalSupplyNotZero();
    error InvalidResetAmount();

    event Transfer(
        address indexed from,
        address indexed to,
        uint8 orderBookId,
        uint256 maturity,
        int256 value
    );

    function getTotalSupply(uint256 maturity) external view returns (uint256);

    function getBalance(
        uint8 orderBookId,
        address user
    ) external view returns (int256 futureValue, uint256 maturity);

    function hasBalanceAtPastMaturity(
        uint8 orderBookId,
        address user,
        uint256 maturity
    ) external view returns (bool);

    function increase(
        uint8 orderBookId,
        address user,
        uint256 amount,
        uint256 maturity,
        bool isTaker
    ) external;

    function decrease(
        uint8 orderBookId,
        address user,
        uint256 amount,
        uint256 maturity,
        bool isTaker
    ) external;

    function transferFrom(
        uint8 orderBookId,
        address sender,
        address receiver,
        int256 amount,
        uint256 maturity
    ) external;

    function reset(
        uint8 orderBookId,
        address user,
        uint256 activeMaturity
    )
        external
        returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved);

    function setInitialTotalSupply(uint256 maturity, int256 amount) external;

    function executeForcedReset(uint8 orderBookId, address user) external;

    function executeForcedReset(
        uint8 orderBookId,
        address user,
        int256 amount
    ) external returns (int256 removedAmount, int256 balance);
}
