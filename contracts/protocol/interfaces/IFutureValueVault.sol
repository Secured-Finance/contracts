// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IFutureValueVault {
    error UserIsZero();
    error TotalSupplyNotZero();
    error InvalidResetAmount();

    event Transfer(address indexed from, address indexed to, uint256 maturity, int256 value);

    function getTotalLendingSupply(uint256 maturity) external view returns (uint256);

    function getTotalBorrowingSupply(uint256 maturity) external view returns (uint256);

    function getBalance(uint256 maturity, address user) external view returns (int256 futureValue);

    function increase(uint256 maturity, address user, uint256 amount) external;

    function decrease(uint256 maturity, address user, uint256 amount) external;

    function transferFrom(
        uint256 maturity,
        address sender,
        address receiver,
        int256 amount
    ) external;

    function reset(
        uint256 maturity,
        address user
    ) external returns (int256 removedAmount, int256 currentAmount, bool isAllRemoved);

    function executeForcedReset(uint256 maturity, address user) external;

    function executeForcedReset(
        uint256 maturity,
        address user,
        int256 amount
    ) external returns (int256 removedAmount, int256 balance);
}
