// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

library CollateralParametersStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralParameters");

    struct Storage {
        // Liquidation threshold rate (in basis point)
        uint256 liquidationThresholdRate;
        // Liquidation fee rate received by protocol (in basis point)
        uint256 liquidationProtocolFeeRate;
        // Liquidation fee rate received by liquidators (in basis point)
        uint256 liquidatorFeeRate;
        //  Uniswap router contract
        ISwapRouter uniswapRouter;
        //  Uniswap quoter contract
        IQuoter uniswapQuoter;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
