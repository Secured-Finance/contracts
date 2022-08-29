// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library CollateralParametersStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralParameters");

    struct Storage {
        // liquidation price rate in basis point
        uint256 liquidationPriceRate;
        // margin call threshold rate in basis point
        uint256 marginCallThresholdRate;
        // auto liquidation threshold rate in basis point
        uint256 autoLiquidationThresholdRate;
        //  minimal collateral rate in basis point
        uint256 minCollateralRate;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
