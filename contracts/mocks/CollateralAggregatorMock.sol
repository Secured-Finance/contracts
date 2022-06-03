// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/AddressPacking.sol";
import "../interfaces/ICollateralVault.sol";
import "../CollateralAggregatorV2.sol";

contract CollateralAggregatorMock is CollateralAggregatorV2 {
    mapping(address => uint256) _maxWithdrawals;
    mapping(bytes32 => PositionWithdrawal) _maxPositionWithdrawals;

    struct PositionWithdrawal {
        uint256 withdraw0;
        uint256 withdraw1;
    }

    constructor(address _resolver) CollateralAggregatorV2(_resolver) {}

    function getMaxCollateralBookWidthdraw(address user) public view override returns (uint256) {
        return _maxWithdrawals[user];
    }

    function getMaxCollateralWidthdraw(address party0, address party1)
        public
        view
        override
        returns (uint256, uint256)
    {
        (bytes32 addrPack, bool flipped) = AddressPacking.pack(party0, party1);
        PositionWithdrawal memory withdrawal = _maxPositionWithdrawals[addrPack];
        withdrawal = _handleFlippedCase(withdrawal, flipped);

        return (withdrawal.withdraw0, withdrawal.withdraw1);
    }

    function setMaxCollateralBookWidthdraw(address user, uint256 amount) public {
        _maxWithdrawals[user] = amount;
    }

    function setMaxCollateralWidthdraw(
        address party0,
        address party1,
        uint256 amount0,
        uint256 amount1
    ) public {
        (bytes32 addrPack, bool flipped) = AddressPacking.pack(party0, party1);
        PositionWithdrawal memory withdrawal;

        withdrawal.withdraw0 = amount0;
        withdrawal.withdraw1 = amount1;

        withdrawal = _handleFlippedCase(withdrawal, flipped);
        _maxPositionWithdrawals[addrPack] = withdrawal;
    }

    function _handleFlippedCase(PositionWithdrawal memory withdrawal, bool flipped)
        internal
        pure
        returns (PositionWithdrawal memory)
    {
        if (flipped) {
            uint256 withdraw = withdrawal.withdraw0;

            withdrawal.withdraw0 = withdrawal.withdraw1;
            withdrawal.withdraw1 = withdraw;
        }

        return withdrawal;
    }

    function rebalanceTo(
        address _user,
        address _counterparty,
        uint256 _amountETH,
        address _vault
    ) external returns (uint256) {
        return ICollateralVault(_vault).rebalanceTo(_user, _counterparty, _amountETH);
    }

    function rebalanceFrom(
        address _user,
        address _counterparty,
        uint256 _amountETH,
        address _vault
    ) external returns (uint256) {
        return ICollateralVault(_vault).rebalanceFrom(_user, _counterparty, _amountETH);
    }

    function rebalanceBetween(
        address _user,
        address _fromParty,
        address _toParty,
        uint256 _amountETH,
        address _vault
    ) external returns (uint256) {
        return ICollateralVault(_vault).rebalanceBetween(_user, _fromParty, _toParty, _amountETH);
    }

    function liquidate(
        address _from,
        address _to,
        uint256 _amountETH,
        address _vault
    ) external returns (uint256) {
        return ICollateralVault(_vault).liquidate(_from, _to, _amountETH);
    }
}
