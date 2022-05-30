// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../libraries/CollateralPosition.sol";

contract CollateralPositionTest {
    using SafeMath for uint256;

    mapping(bytes32 => CollateralPosition.Position) private _positions;

    function get(address party0, address party1)
        public
        view
        returns (uint256, uint256)
    {
        return CollateralPosition.get(_positions, party0, party1);
    }

    function getGasCostOfGet(address party0, address party1)
        public
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        CollateralPosition.get(_positions, party0, party1);

        return gasBefore - gasleft();
    }

    function deposit(
        address depositor,
        address counterparty,
        uint256 amount
    ) public {
        (uint256 lockedCollateralBeforeDepositor, ) = get(
            depositor,
            counterparty
        );

        CollateralPosition.deposit(_positions, depositor, counterparty, amount);

        (uint256 lockedCollateralAfterDepositor, ) = get(
            depositor,
            counterparty
        );

        require(
            lockedCollateralAfterDepositor ==
                lockedCollateralBeforeDepositor.add(amount),
            "INCORRECT_DEPOSIT_ADDITION"
        );
    }

    function withdraw(
        address user,
        address counterparty,
        uint256 amount
    ) public {
        (uint256 lockedCollateralBeforeUser, ) = get(user, counterparty);

        CollateralPosition.withdraw(_positions, user, counterparty, amount);

        (uint256 lockedCollateralAfterUser, ) = get(user, counterparty);

        uint256 withdrawn = lockedCollateralBeforeUser >= amount
            ? amount
            : lockedCollateralBeforeUser;
        require(
            lockedCollateralAfterUser ==
                lockedCollateralBeforeUser.sub(withdrawn),
            "INCORRECT_WITHDRAW_SUBSTRACTION"
        );
    }

    function liquidate(
        address from,
        address to,
        uint256 amount
    ) public {
        (
            uint256 lockedCollateralBeforeFrom,
            uint256 lockedCollateralBeforeTo
        ) = get(from, to);

        CollateralPosition.liquidate(_positions, from, to, amount);

        (
            uint256 lockedCollateralAfterFrom,
            uint256 lockedCollateralAfterTo
        ) = get(from, to);

        uint256 liquidated = lockedCollateralBeforeFrom >= amount
            ? amount
            : lockedCollateralBeforeFrom;

        require(
            lockedCollateralAfterFrom ==
                lockedCollateralBeforeFrom.sub(liquidated),
            "INCORRECT_LIQUIDATION_SUBSTRACTION"
        );
        require(
            lockedCollateralAfterTo == lockedCollateralBeforeTo.add(liquidated),
            "INCORRECT_LIQUIDATION_ADDITION"
        );
    }

    function rebalance(
        address user,
        address fromParty,
        address toParty,
        uint256 amount
    ) public {
        (uint256 lockedCollateralBeforeUser0, ) = get(user, fromParty);
        (uint256 lockedCollateralBeforeUser1, ) = get(user, toParty);

        CollateralPosition.rebalance(
            _positions,
            user,
            fromParty,
            toParty,
            amount
        );

        (uint256 lockedCollateralAfterUser0, ) = get(user, fromParty);
        (uint256 lockedCollateralAfterUser1, ) = get(user, toParty);

        uint256 rebalanced = lockedCollateralBeforeUser0 >= amount
            ? amount
            : lockedCollateralBeforeUser0;

        require(
            lockedCollateralAfterUser0 ==
                lockedCollateralBeforeUser0.sub(rebalanced),
            "INCORRECT_REBALANCE_SUBSTRACTION"
        );

        require(
            lockedCollateralAfterUser1 ==
                lockedCollateralBeforeUser1.add(rebalanced),
            "INCORRECT_REBALANCE_ADDITION"
        );
    }

    function clear(address party0, address party1) public {
        CollateralPosition.clear(_positions, party0, party1);

        (uint256 lockedCollateralA, uint256 lockedCollateralB) = get(
            party0,
            party1
        );

        require(
            lockedCollateralA == 0 && lockedCollateralB == 0,
            "INCORRECT_POSITION_CLEAR"
        );
    }
}
