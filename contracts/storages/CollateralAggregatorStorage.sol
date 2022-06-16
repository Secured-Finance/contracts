// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../libraries/NetPV.sol";

library CollateralAggregatorStorage {
    using Address for address;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using NetPV for NetPV.CcyNetting;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralAggregator");

    struct Storage {
        // Mapping for total amount of collateral locked against independent collateral from all books.
        mapping(address => mapping(bytes32 => uint256)) unsettledCollateral;
        // Mapping for used currencies in unsettled exposures.
        mapping(address => EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
        // Mapping for all registered users.
        mapping(address => bool) isRegistered;
        // Mapping for used currencies set in bilateral position.
        mapping(bytes32 => EnumerableSet.Bytes32Set) exposedCurrencies;
        // Mapping for used currency vaults in bilateral position.
        mapping(bytes32 => EnumerableSet.Bytes32Set) usedCurrenciesInPosition;
        // Mapping for used currency vaults per user.
        mapping(address => EnumerableSet.Bytes32Set) usedCurrencies;
        // Mapping for exposures per currency in bilateral position.
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) ccyNettings;
        // storages for MixinCollateralManagement
        EnumerableSet.AddressSet collateralUsers;
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
