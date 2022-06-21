// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICollateralVault {
    event Deposit(address user, bytes32 ccy, uint256 amount);
    event PositionDeposit(address user, address counterparty, bytes32 ccy, uint256 amount);
    event RebalanceBetween(
        address user,
        address fromCounterparty,
        address toCounterparty,
        bytes32 ccy,
        uint256 amount
    );
    event RebalanceFrom(address user, address counterparty, bytes32 ccy, uint256 amount);
    event RebalanceTo(address user, address counterparty, bytes32 ccy, uint256 amount);
    event Withdraw(address from, bytes32 ccy, uint256 amount);
    event PositionWithdraw(address from, address counterparty, bytes32 ccy, uint256 amount);
    event Liquidate(address from, address to, bytes32 ccy, uint256 amount);
    event LiquidateIndependent(address from, address to, bytes32 ccy, uint256 amount);

    function deposit(
        address _counterparty,
        bytes32 _ccy,
        uint256 _amount
    ) external;

    function deposit(bytes32 _ccy, uint256 _amount) external payable;

    function getIndependentCollateral(address _user, bytes32 _ccy) external view returns (uint256);

    function getIndependentCollateralInETH(address _user, bytes32 _ccy)
        external
        view
        returns (uint256);

    function getLockedCollateral(address _user, bytes32 _ccy) external view returns (uint256);

    function getLockedCollateralInETH(address _user, bytes32 _ccy) external view returns (uint256);

    function getLockedCollateral(
        address _partyA,
        address _partyB,
        bytes32 _ccy
    ) external view returns (uint256, uint256);

    function getLockedCollateralInETH(
        address _partyA,
        address _partyB,
        bytes32 _ccy
    ) external view returns (uint256, uint256);

    function liquidate(
        address _from,
        address _to,
        uint256 _liquidationTarget
    ) external returns (bool);

    function rebalanceCollateral(
        address _party0,
        address _party1,
        uint256 _rebalanceTarget,
        bool isRebalanceFrom
    ) external returns (bool);

    function rebalanceBetween(
        address _user,
        address _fromParty,
        address _toParty,
        bytes32 _ccy,
        uint256 _amountETH
    ) external returns (uint256);

    function withdraw(bytes32 _ccy, uint256 _amount) external;

    function withdrawFrom(
        address _counterparty,
        bytes32 _ccy,
        uint256 _amount
    ) external;

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getUsedCurrencies(address party0, address party1)
        external
        view
        returns (bytes32[] memory);

    function getTotalIndependentCollateralInETH(address _party) external view returns (uint256);

    function getTotalLockedCollateralInETH(address _party0, address _party1)
        external
        view
        returns (uint256, uint256);
}
