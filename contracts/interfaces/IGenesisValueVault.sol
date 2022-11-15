// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {MaturityUnitPrice} from "../storages/GenesisValueVaultStorage.sol";

interface IGenesisValueVault {
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, int256 value);
    event CompoundFactorUpdated(
        bytes32 indexed ccy,
        uint256 compoundFactor,
        uint256 unitPrice,
        uint256 currentMaturity,
        uint256 previousMaturity
    );

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function decimals(bytes32 ccy) external view returns (uint8);

    function getTotalLendingSupply(bytes32 ccy) external view returns (uint256);

    function getTotalBorrowingSupply(bytes32 ccy) external view returns (uint256);

    function getGenesisValue(bytes32 ccy, address user) external view returns (int256);

    function getCurrentMaturity(bytes32 ccy) external view returns (uint256);

    function getCompoundFactor(bytes32 ccy) external view returns (uint256);

    function getMaturityUnitPrice(bytes32 ccy, uint256 maturity)
        external
        view
        returns (MaturityUnitPrice memory);

    function getGenesisValueInFutureValue(bytes32 ccy, address user) external view returns (int256);

    function calculateGVFromFV(
        bytes32 ccy,
        uint256 basisMaturity,
        int256 futureValue
    ) external view returns (int256);

    function calculateFVFromGV(
        bytes32 ccy,
        uint256 basisMaturity,
        int256 genesisValue
    ) external view returns (int256);

    function registerCurrency(
        bytes32 ccy,
        uint8 decimals,
        uint256 compoundFactor
    ) external;

    function updateCompoundFactor(
        bytes32 ccy,
        uint256 maturity,
        uint256 nextMaturity,
        uint256 unitPrice
    ) external;

    function addGenesisValue(
        bytes32 ccy,
        address user,
        uint256 basisMaturity,
        int256 futureValue
    ) external returns (bool);
}
