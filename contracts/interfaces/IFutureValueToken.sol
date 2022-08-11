// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title IFutureValueToken is a common interface for FutureValueToken
 */
interface IFutureValueToken {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, int256 value);

    function totalLendingSupply(uint256 _maturity) external view returns (uint256);

    function totalBorrowingSupply(uint256 _maturity) external view returns (uint256);

    function getMaturity(address _account) external view returns (uint256);

    function getMaturity() external view returns (uint256);

    function getCcy() external view returns (bytes32);

    function balanceInMaturityOf(address account) external view returns (int256, uint256);

    function hasPastMaturityBalance(address account) external view returns (bool);

    function updateMaturity(uint256 _maturity) external;

    function balanceOf(address account) external view returns (int256);

    function mint(
        address lender,
        address borrower,
        uint256 amount
    ) external returns (bool);

    function burnFrom(address account) external returns (int256);
}
