// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICollateralVaultV2 {
    event Deposit(address user, bytes32 ccy, uint256 amount);
    event Withdraw(address from, bytes32 ccy, uint256 amount);
    event CurrencyRegistered(bytes32 ccy, address tokenAddress);

    function deposit(bytes32 _ccy, uint256 _amount) external payable;

    function getIndependentCollateral(address _user, bytes32 _ccy) external view returns (uint256);

    function getIndependentCollateralInETH(address _user, bytes32 _ccy)
        external
        view
        returns (uint256);

    function withdraw(bytes32 _ccy, uint256 _amount) external;

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getTotalIndependentCollateralInETH(address _party) external view returns (uint256);
}
