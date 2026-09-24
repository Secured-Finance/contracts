// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {FundManagementLogic} from "../../protocol/libraries/logics/FundManagementLogic.sol";
import {LendingMarketControllerStorage as Storage} from "../../protocol/storages/LendingMarketControllerStorage.sol";
import {EnumerableSet} from "../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

contract FundManagementLogicCaller {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;

    function registerCurrency(bytes32 _ccy, address _user) external returns (bool) {
        return FundManagementLogic.registerCurrency(_ccy, _user);
    }

    function registerCurrencyAndMaturity(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external returns (bool) {
        return FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
    }

    function getUsedCurrenciesLength(address _user) external view returns (uint256) {
        return Storage.slot().usedCurrencies[_user].length();
    }

    function getUsedMaturitiesLength(bytes32 _ccy, address _user) external view returns (uint256) {
        return Storage.slot().usedMaturities[_ccy][_user].length();
    }

    function getUsedMaturityAt(
        bytes32 _ccy,
        address _user,
        uint256 _index
    ) external view returns (uint256) {
        return Storage.slot().usedMaturities[_ccy][_user].at(_index);
    }
}
