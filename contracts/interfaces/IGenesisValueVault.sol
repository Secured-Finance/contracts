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

    function isInitialized(bytes32 ccy) external view returns (bool);

    function decimals(bytes32 ccy) external view returns (uint8);

    function getTotalLendingSupply(bytes32 ccy) external view returns (uint256);

    function getTotalBorrowingSupply(bytes32 ccy) external view returns (uint256);

    function getGenesisValue(bytes32 ccy, address user) external view returns (int256);

    function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity)
        external
        view
        returns (int256);

    function getCurrentMaturity(bytes32 ccy) external view returns (uint256);

    function getCompoundFactor(bytes32 ccy) external view returns (uint256);

    function getMaturityUnitPrice(bytes32 ccy, uint256 maturity)
        external
        view
        returns (MaturityUnitPrice memory);

    function getGenesisValueInFutureValue(bytes32 ccy, address user) external view returns (int256);

    function calculateCurrentFVFromFVInMaturity(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) external view returns (int256);

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

    function initialize(
        bytes32 ccy,
        uint8 decimals,
        uint256 compoundFactor,
        uint256 maturity
    ) external;

    function executeAutoRoll(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice,
        uint256 _totalFVAmount
    ) external;

    function updateGenesisValue(
        bytes32 ccy,
        address user,
        uint256 basisMaturity,
        int256 fvAmount
    ) external returns (bool);

    function addLendGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _maturity,
        uint256 _absAmount
    ) external returns (bool);

    function addBorrowGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _maturity,
        uint256 _absAmount
    ) external returns (bool);
}
