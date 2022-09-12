// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IAddressResolver} from "../interfaces/IAddressResolver.sol";

library MixinAddressResolverStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.mixinAddressResolver");

    struct Storage {
        IAddressResolver resolver;
        mapping(bytes32 => address) addressCache;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
