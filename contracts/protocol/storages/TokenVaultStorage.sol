// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {EnumerableSet} from "../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

library TokenVaultStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.tokenVault");

    struct Storage {
        // Liquidation threshold rate (in basis point)
        uint256 liquidationThresholdRate;
        // Liquidation fee rate received by protocol (in basis point)
        uint256 liquidationProtocolFeeRate;
        // Liquidation fee rate received by liquidators (in basis point)
        uint256 liquidatorFeeRate;
        // Currencies accepted as collateral
        EnumerableSet.Bytes32Set collateralCurrencies;
        // Mapping from currency name to token address
        mapping(bytes32 => address) tokenAddresses;
        // Mapping for used currency vaults per user.
        mapping(address => EnumerableSet.Bytes32Set) usedCurrencies;
        // Mapping from currency to total deposit amount
        mapping(bytes32 => uint256) totalDepositAmount;
        // Mapping for all deposits per users
        mapping(address => mapping(bytes32 => uint256)) depositAmounts;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
