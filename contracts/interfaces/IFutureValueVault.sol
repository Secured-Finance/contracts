// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFutureValueVault {
    function getTotalLendingSupply(uint256 _maturity) external view returns (uint256);

    function getTotalBorrowingSupply(uint256 _maturity) external view returns (uint256);

    function getFutureValue(address _account)
        external
        view
        returns (int256 futureValue, uint256 maturity);

    function calculatePresentValue(
        uint256 _futureValue,
        uint256 _maturity,
        uint256 _rate
    ) external view returns (uint256);

    function hasFutureValueInPastMaturity(address _account, uint256 _maturity)
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
        returns (int256 removedAmount, uint256 maturity);
}
