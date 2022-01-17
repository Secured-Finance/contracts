// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface ICollateralVault {
    event Deposit(address user, uint256 amount);
    event PositionDeposit(
        address party0,
        address party1,
        uint256 amount0,
        uint256 amount1
    );
    event RebalanceBetween(
        address user, 
        address fromCounterparty, 
        address toCounterparty, 
        uint256 amount
    );
    event RebalanceFrom(address user, address counterparty, uint256 amount);
    event RebalanceTo(address user, address counterparty, uint256 amount);
    event Withdraw(address from, uint256 amount);
    event PositionWithdraw(address from, address counterparty, uint256 amount);
    event Liquidate(address from, address to, uint256 amount);

    function ccy() external view returns (bytes32);
    function tokenAddress() external view returns (address);

    function deposit(address _counterparty, uint256 _amount) external;
    function deposit(uint256 _amount) external;

    function getIndependentCollateral(address _user)
        external
        view
        returns (uint256);

    function getIndependentCollateralInETH(address _user)
        external
        view
        returns (uint256);

    function getLockedCollateral(address _partyA, address _partyB)
        external
        view
        returns (uint256, uint256);

    function getLockedCollateral(address _user) external view returns (uint256);

    function getLockedCollateralInETH(address _partyA, address _partyB)
        external
        view
        returns (uint256, uint256);

    function getLockedCollateralInETH(address _user)
        external
        view
        returns (uint256);

    function liquidate(
        address _from,
        address _to,
        uint256 _amountETH
    ) external returns (uint256 liquidationLeftETH);

    function owner() external view returns (address);

    function rebalanceBetween(
        address _user,
        address _fromParty,
        address _toParty,
        uint256 _amountETH
    ) external returns (uint256);

    function rebalanceFrom(
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external returns (uint256);

    function rebalanceTo(
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external returns (uint256);

    function withdraw(uint256 _amount) external;
    function withdrawFrom(address _counterparty, uint256 _amount) external;
}