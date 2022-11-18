// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFutureValueVault {
    event Transfer(address indexed from, address indexed to, int256 value);

    function getTotalLendingSupply(uint256 _maturity) external view returns (uint256);

    function getTotalBorrowingSupply(uint256 _maturity) external view returns (uint256);

    function getFutureValue(address _user)
        external
        view
        returns (int256 futureValue, uint256 maturity);

    function hasFutureValueInPastMaturity(address _user, uint256 _maturity)
        external
        view
        returns (bool);

    function addBorrowFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external returns (bool);

    function addLendFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external returns (bool);

    function removeFutureValue(address _user, uint256 _maturity)
        external
        returns (
            int256 removedAmount,
            int256 currentAmount,
            uint256 maturity
        );
}
