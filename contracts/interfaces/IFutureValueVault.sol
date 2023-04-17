// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFutureValueVault {
    event Transfer(address indexed from, address indexed to, int256 value);

    function getTotalSupply(uint256 maturity) external view returns (uint256);

    function getFutureValue(address user)
        external
        view
        returns (int256 futureValue, uint256 maturity);

    function hasFutureValueInPastMaturity(address user, uint256 maturity)
        external
        view
        returns (bool);

    function addLendFutureValue(
        address user,
        uint256 amount,
        uint256 maturity,
        bool isTaker
    ) external returns (bool);

    function addBorrowFutureValue(
        address user,
        uint256 amount,
        uint256 maturity,
        bool isTaker
    ) external returns (bool);

    function offsetFutureValue(
        address lender,
        address borrower,
        uint256 maximumFVAmount
    ) external returns (uint256 offsetAmount);

    function removeFutureValue(address user, uint256 activeMaturity)
        external
        returns (
            int256 removedAmount,
            int256 currentAmount,
            uint256 maturity,
            bool removeFutureValue
        );

    function addInitialTotalSupply(uint256 maturity, int256 amount) external;

    function resetFutureValue(address _user) external;
}
