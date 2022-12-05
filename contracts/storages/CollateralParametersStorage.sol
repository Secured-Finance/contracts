// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IUniswapV2Router02} from "../dependencies/uniswap/IUniswapV2Router02.sol";

library CollateralParametersStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralParameters");

    struct Storage {
        // liquidation threshold rate in basis point
        uint256 liquidationThresholdRate;
        //  Uniswap router contract
        IUniswapV2Router02 uniswapRouter;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
