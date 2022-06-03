// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./AddressPacking.sol";

library CollateralPosition {
    using SafeMath for uint256;

    /**
     * @dev Position structure used for keeping track of collateral
     * amounts locked by counterparties in bilateral relations
     */
    struct Position {
        uint256 lockedCollateralA;
        uint256 lockedCollateralB;
    }

    function _handleFlippedCase(CollateralPosition.Position memory position, bool flipped)
        internal
        pure
        returns (CollateralPosition.Position memory)
    {
        if (flipped) {
            uint256 locked = position.lockedCollateralA;

            position.lockedCollateralA = position.lockedCollateralB;
            position.lockedCollateralB = locked;
        }

        return position;
    }

    /**
     * @dev Returns the bilateral collateral position between 2 counterparties
     * @param self The mapping with all bilateral collateral positions
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     */
    function get(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address party0,
        address party1
    ) internal view returns (uint256, uint256) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(party0, party1);
        CollateralPosition.Position memory position = self[packedAddrs];
        position = _handleFlippedCase(position, flipped);

        return (position.lockedCollateralA, position.lockedCollateralB);
    }

    /**
     * @dev Adds deposited amount into bilateral position from one party
     * @param self The mapping with all bilateral collateral positions
     * @param depositor Address of user depositing funds
     * @param counterparty Counterparty address
     * @param amount Number of funds deposited by user
     */
    function deposit(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address depositor,
        address counterparty,
        uint256 amount
    ) internal {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(depositor, counterparty);
        CollateralPosition.Position storage position = self[packedAddrs];

        if (!flipped) {
            position.lockedCollateralA = position.lockedCollateralA.add(amount);
        } else {
            position.lockedCollateralB = position.lockedCollateralB.add(amount);
        }
    }

    // /**
    // * @dev Adds deposited amounts into bilateral position,
    // * helpful during rebalancing from books of both parties
    // * @param self The mapping with all bilateral collateral positions
    // * @param party0 First counterparty address
    // * @param party1 Second counterparty address
    // * @param amount0 Number of funds deposited by first counterparty
    // * @param amount1 Number of funds deposited by second counterparty
    // */
    // function deposit(
    //     mapping(bytes32 => CollateralPosition.Position) storage self,
    //     address party0,
    //     address party1,
    //     uint256 amount0,
    //     uint256 amount1
    // ) internal {
    //     (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(party0, party1);
    //     CollateralPosition.Position storage position = self[packedAddrs];

    //     position.lockedCollateralA = flipped ? position.lockedCollateralA.add(amount1) : position.lockedCollateralA.add(amount0);
    //     position.lockedCollateralB = flipped ? position.lockedCollateralB.add(amount0) : position.lockedCollateralB.add(amount1);
    // }

    /**
     * @dev Removes withdrawn amounts from bilateral position for one party
     * @param self The mapping with all bilateral collateral positions
     * @param user Address of user withdrawing funds
     * @param counterparty Counterparty address
     * @param amount Number of funds withdrawn by user
     * @notice Returns the number of funds withdrawn by user
     */
    function withdraw(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address user,
        address counterparty,
        uint256 amount
    ) internal returns (uint256 maxWithdraw) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(user, counterparty);
        CollateralPosition.Position storage position = self[packedAddrs];

        if (!flipped) {
            maxWithdraw = position.lockedCollateralA >= amount
                ? amount
                : position.lockedCollateralA;
            position.lockedCollateralA = position.lockedCollateralA.sub(maxWithdraw);
        } else {
            maxWithdraw = position.lockedCollateralB >= amount
                ? amount
                : position.lockedCollateralB;
            position.lockedCollateralB = position.lockedCollateralB.sub(maxWithdraw);
        }
    }

    // /**
    // * @dev Removes withdrawn amounts from bilateral position for both parties
    // * @param self The mapping with all bilateral collateral positions
    // * @param party0 First counterparty address
    // * @param party1 Second counterparty address
    // * @param amount0 Number of funds withdrawn by first counterparty
    // * @param amount1 Number of funds withdrawn by second counterparty
    // */
    // function withdraw(
    //     mapping(bytes32 => CollateralPosition.Position) storage self,
    //     address party0,
    //     address party1,
    //     uint256 amount0,
    //     uint256 amount1
    // ) internal {
    //     (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(party0, party1);
    //     CollateralPosition.Position storage position = self[packedAddrs];

    //     position.lockedCollateralA = flipped ? position.lockedCollateralA.sub(amount1) : position.lockedCollateralA.sub(amount0);
    //     position.lockedCollateralB = flipped ? position.lockedCollateralB.sub(amount0) : position.lockedCollateralB.sub(amount1);
    // }

    /**
     * @dev Liquidates required amount from one party to another inside position
     * @param self The mapping with all bilateral collateral positions
     * @param from Address for liquidating collateral from
     * @param to Address for sending collateral to
     * @param amount Number of funds to liquidate
     */
    function liquidate(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address from,
        address to,
        uint256 amount
    ) internal returns (uint256 liquidated) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(from, to);
        CollateralPosition.Position storage position = self[packedAddrs];

        if (!flipped) {
            liquidated = position.lockedCollateralA >= amount ? amount : position.lockedCollateralA;
            position.lockedCollateralA = position.lockedCollateralA.sub(liquidated);
            position.lockedCollateralB = position.lockedCollateralB.add(liquidated);
        } else {
            liquidated = position.lockedCollateralB >= amount ? amount : position.lockedCollateralB;
            position.lockedCollateralB = position.lockedCollateralB.sub(liquidated);
            position.lockedCollateralA = position.lockedCollateralA.add(liquidated);
        }
    }

    /**
     * @dev Rebalances required amount between 2 bilateral positions
     * @param self The mapping with all bilateral collateral positions
     * @param user Address of main party to rebalance funds between counterparties for
     * @param fromParty Counterparty address for rebalancing collateral from
     * @param toParty Counterparty address for rebalancing collateral to
     * @param amount Number of funds to rebalance
     */
    function rebalance(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address user,
        address fromParty,
        address toParty,
        uint256 amount
    ) internal returns (uint256 rebalanced) {
        // max checks
        (bytes32 packedAddr, bool flipped) = AddressPacking.pack(user, fromParty);
        CollateralPosition.Position storage position = self[packedAddr];

        if (!flipped) {
            rebalanced = position.lockedCollateralA >= amount ? amount : position.lockedCollateralA;
            position.lockedCollateralA = position.lockedCollateralA.sub(rebalanced);
        } else {
            rebalanced = position.lockedCollateralB >= amount ? amount : position.lockedCollateralB;
            position.lockedCollateralB = position.lockedCollateralB.sub(rebalanced);
        }

        (packedAddr, flipped) = AddressPacking.pack(user, toParty);
        position = self[packedAddr];

        if (!flipped) {
            position.lockedCollateralA = position.lockedCollateralA.add(rebalanced);
        } else {
            position.lockedCollateralB = position.lockedCollateralB.add(rebalanced);
        }
    }

    /**
     * @dev Clears the state of bilateral position
     * @param self The mapping with all bilateral collateral positions
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     */
    function clear(
        mapping(bytes32 => CollateralPosition.Position) storage self,
        address party0,
        address party1
    ) internal {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        delete self[packedAddrs];
    }
}
