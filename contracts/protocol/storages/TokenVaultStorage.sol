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
        mapping(bytes32 ccy => address tokenAddress) tokenAddresses;
        // List of currency that the user has deposit amounts
        mapping(address user => EnumerableSet.Bytes32Set currency) usedCurrencies;
        mapping(bytes32 ccy => uint256 totalDepositAmount) totalDepositAmount;
        mapping(address user => mapping(bytes32 currency => uint256 depositAmount)) depositAmounts;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
