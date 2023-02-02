// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {LiquidatorStorage as Storage} from "../storages/LiquidatorStorage.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";

/**
 * @notice LiquidatorHandler is an library to handle the main parameters of liquidators.
 */
library LiquidatorHandler {
    /**
     * @notice Gets if the user is registered as a liquidator.
     * @return The boolean if the user is registered as a liquidator or not
     */
    function isRegistered(address user) internal view returns (bool) {
        return Storage.slot().liquidators[user] != 0;
    }

    /**
     * @notice Gets if the liquidator is active.
     * @return The boolean if the liquidator is active or not
     */
    function isActive(address user) internal view returns (bool) {
        return isRegistered(user) && Storage.slot().liquidators[user] < block.number;
    }

    /**
     * @notice Registers a user as a liquidator.
     * @param _user User's address
     */
    function register(address _user) internal {
        Storage.slot().liquidators[_user] = block.number;
    }

    /**
     * @notice Removes a user from a liquidator.
     * @param _user User's address
     */
    function remove(address _user) internal {
        Storage.slot().liquidators[_user] = 0;
    }
}
