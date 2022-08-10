// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/IGenesisValueToken.sol";

library LendingMarketControllerV2Storage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketControllerV2");

    struct Storage {
        address lendingMarketProxy;
        address sfLoanTokenProxy;
        mapping(bytes32 => address[]) lendingMarkets;
        uint256 basisDate;
        uint256 basisTerm;
        IGenesisValueToken gvToken;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
