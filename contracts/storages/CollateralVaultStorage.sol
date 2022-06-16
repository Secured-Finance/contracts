// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/CollateralPosition.sol";

library CollateralVaultStorage {
    using CollateralPosition for CollateralPosition.Position;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralVault");

    struct Book {
        uint256 independentAmount;
        uint256 lockedCollateral;
    }

    struct Storage {
        mapping(bytes32 => address) tokenAddress;
        // Mapping for all deposits of users collateral per currency
        mapping(bytes32 => mapping(address => Book)) books;
        // Mapping for bilateral collateral positions between 2 counterparties per currency
        mapping(bytes32 => mapping(bytes32 => CollateralPosition.Position)) positions;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
