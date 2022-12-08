// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

library CollateralParametersStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralParameters");

    struct Storage {
        // liquidation threshold rate in basis point
        uint256 liquidationThresholdRate;
        //  Uniswap router contract
        ISwapRouter uniswapRouter;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
