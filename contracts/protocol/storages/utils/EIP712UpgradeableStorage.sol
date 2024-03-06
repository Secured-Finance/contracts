// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../../../dependencies/openzeppelin/utils//ShortStrings.sol";

library EIP712UpgradeableStorage {
    using ShortStrings for *;

    bytes32 internal constant STORAGE_SLOT =
        bytes32(uint256(keccak256("sf.storage.eip712UpgradeableStorage")) - 1);

    struct Storage {
        bytes32 cachedDomainSeparator;
        uint256 cachedChainId;
        address cachedThis;
        bytes32 hashedName;
        bytes32 hashedVersion;
        ShortString name;
        ShortString version;
        string nameFallback;
        string versionFallback;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
