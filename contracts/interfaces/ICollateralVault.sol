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

    function getLockedCollateral(bytes32 _ccy, address _user) external view returns (uint256);

    function getLockedCollateralInETH(bytes32 _ccy, address _user) external view returns (uint256);

    function getLockedCollateral(
        bytes32 _ccy,
        address _partyA,
        address _partyB
    ) external view returns (uint256, uint256);

    function getLockedCollateralInETH(
        bytes32 _ccy,
        address _partyA,
        address _partyB
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
        bytes32 _ccy,
        address _user,
        address _fromParty,
        address _toParty,
        uint256 _amountETH
    ) external returns (uint256);

    function withdraw(bytes32 _ccy, uint256 _amount) external;

    function withdrawFrom(
        bytes32 _ccy,
        address _counterparty,
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
