// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICollateralVault {
    event Deposit(bytes32 _ccy, address user, uint256 amount);
    event PositionDeposit(bytes32 _ccy, address user, address counterparty, uint256 amount);
    event RebalanceBetween(
        bytes32 _ccy,
        address user,
        address fromCounterparty,
        address toCounterparty,
        uint256 amount
    );
    event RebalanceFrom(bytes32 _ccy, address user, address counterparty, uint256 amount);
    event RebalanceTo(bytes32 _ccy, address user, address counterparty, uint256 amount);
    event Withdraw(bytes32 _ccy, address from, uint256 amount);
    event PositionWithdraw(bytes32 _ccy, address from, address counterparty, uint256 amount);
    event Liquidate(bytes32 _ccy, address from, address to, uint256 amount);
    event LiquidateIndependent(bytes32 _ccy, address from, address to, uint256 amount);

    function deposit(
        bytes32 _ccy,
        address _counterparty,
        uint256 _amount
    ) external;

    function deposit(bytes32 _ccy, uint256 _amount) external payable;

    function getIndependentCollateral(bytes32 _ccy, address _user) external view returns (uint256);

    function getIndependentCollateralInETH(bytes32 _ccy, address _user)
        external
        view
        returns (uint256);

    function getLockedCollateral(
        bytes32 _ccy,
        address _partyA,
        address _partyB
    ) external view returns (uint256, uint256);

    function getLockedCollateral(bytes32 _ccy, address _user) external view returns (uint256);

    function getLockedCollateralInETH(
        bytes32 _ccy,
        address _partyA,
        address _partyB
    ) external view returns (uint256, uint256);

    function getLockedCollateralInETH(bytes32 _ccy, address _user) external view returns (uint256);

    function liquidate(
        bytes32 _ccy,
        address _from,
        address _to,
        uint256 _amountETH
    ) external returns (uint256 liquidationLeftETH);

    function rebalanceBetween(
        bytes32 _ccy,
        address _user,
        address _fromParty,
        address _toParty,
        uint256 _amountETH
    ) external returns (uint256);

    function rebalanceFrom(
        bytes32 _ccy,
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external returns (uint256);

    function rebalanceTo(
        bytes32 _ccy,
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external returns (uint256);

    function withdraw(bytes32 _ccy, uint256 _amount) external;

    function withdrawFrom(
        bytes32 _ccy,
        address _counterparty,
        uint256 _amount
    ) external;
}
