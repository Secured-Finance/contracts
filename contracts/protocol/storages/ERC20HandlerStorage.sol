// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library ERC20HandlerStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.erc20Handler");

    struct Storage {
        address baseCurrency;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
