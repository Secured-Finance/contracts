// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {CollateralParametersHandler} from "./libraries/CollateralParametersHandler.sol";
// interfaces
import {ICollateralAggregator} from "./interfaces/ICollateralAggregator.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {CollateralAggregatorStorage as Storage} from "./storages/CollateralAggregatorStorage.sol";

/**
 * @title Collateral Aggregator contract is used to manage collateral obligations
 * and calculation of collateral across collateral vaults.
 */
contract CollateralAggregator is ICollateralAggregator, MixinAddressResolver, Ownable, Proxyable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @dev Modifier to check if user hasn't been registered yet
     */
    modifier nonRegisteredUser(address _user) {
        require(!Storage.slot().isRegistered[_user], "User exists");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate,
        uint256 _minCollateralRate
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);

        CollateralParametersHandler.setCollateralParameters(
            _marginCallThresholdRate,
            _autoLiquidationThresholdRate,
            _liquidationPriceRate,
            _minCollateralRate
        );
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.COLLATERAL_VAULT;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @dev Gets if the collateral has enough coverage.
     * @param _user User's address
     * @param _ccy Currency
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function isCovered(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) public view override returns (bool) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, _ccy, _unsettledExp);

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * ProtocolTypes.PCT >=
                totalUsedCollateral * CollateralParametersHandler.marginCallThresholdRate());
    }

    function isRegisteredUser(address addr) external view override returns (bool) {
        return Storage.slot().isRegistered[addr];
    }

    /**
     * @dev Gets maximum amount of ETH available to withdraw from `_user` collateral.
     * @param _user User's address
     */
    function getWithdrawableCollateral(address _user) external view virtual returns (uint256) {
        return _getWithdrawableCollateral(_user);
    }

    /**
     * @dev Gets the collateral coverage.
     * @param _user User's address
     */
    function getCoverage(address _user) public view override returns (uint256 coverage) {
        return _getCoverage(_user, "", 0);
    }

    /**
     * @dev Gets unsettled exposure for selected currency
     * @param _user User's address
     * @param _ccy Currency
     */
    function getUnsettledCollateral(address _user, bytes32 _ccy) external view returns (uint256) {
        return Storage.slot().unsettledCollateral[_user][_ccy];
    }

    /**
     * @dev Gets the total collateral amount
     * @param _user User's address
     */
    function getUnusedCollateral(address _user) external view returns (uint256) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, "", 0);

        return totalCollateral > totalUsedCollateral ? totalCollateral - totalUsedCollateral : 0;
    }

    /**
     * @dev Gets total unsettled exposure across all currencies
     * @param _user User's address
     */
    function getTotalUnsettledExposure(address _user) external view override returns (uint256) {
        return _getTotalUnsettledExposure(_user, "", 0);
    }

    /**
     * @dev Gets collateral parameters
     */
    function getCollateralParameters()
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return CollateralParametersHandler.getCollateralParameters();
    }

    /**
     * @dev Register user and store collateral book
     */
    function register() external override nonRegisteredUser(msg.sender) {
        Storage.slot().isRegistered[msg.sender] = true;

        emit Register(msg.sender);
    }

    /**
     * @dev Locks unsettled collateral on a global book for selected currency.
     * @param user User's address
     * @param ccy Specified currency of the deal
     * @param amount Amount of funds to be locked in specified currency
     */
    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external override onlyAcceptedContracts {
        Storage.slot().exposedUnsettledCurrencies[user].add(ccy);
        require(isCovered(user, ccy, amount), "Not enough collateral");

        Storage.slot().unsettledCollateral[user][ccy] += amount;

        emit UseUnsettledCollateral(user, ccy, amount);
    }

    /**
     * @dev Releases the amount of unsettled exposure in specific currency
     * @param user User's address
     * @param ccy Specified currency of the deal
     * @param amount Amount of funds to be unlocked from unsettled exposure in specified currency
     */
    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external override onlyAcceptedContracts {
        Storage.slot().unsettledCollateral[user][ccy] -= amount;

        if (Storage.slot().unsettledCollateral[user][ccy] == 0) {
            Storage.slot().exposedUnsettledCurrencies[user].remove(ccy);
        }

        emit ReleaseUnsettled(user, ccy, amount);
    }

    /**
     * @dev Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     *
     * @param _marginCallThresholdRate Margin call threshold ratio
     * @param _autoLiquidationThresholdRate Auto liquidation threshold rate
     * @param _liquidationPriceRate Liquidation price rate
     * @param _minCollateralRate Minimal collateral rate
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate,
        uint256 _minCollateralRate
    ) external onlyOwner {
        CollateralParametersHandler.setCollateralParameters(
            _marginCallThresholdRate,
            _autoLiquidationThresholdRate,
            _liquidationPriceRate,
            _minCollateralRate
        );
    }

    /**
     * @dev Gets the collateral coverage.
     * @param _user User's address
     * @param _ccy Currency
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function _getCoverage(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256 coverage) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, _ccy, _unsettledExp);

        if (totalCollateral > 0) {
            coverage = (((totalUsedCollateral) * ProtocolTypes.PCT) / totalCollateral);
        }
    }

    /**
     * @dev Gets total unsettled exposure across all currencies.
     * @param _user User's ethereum address
     * @param _ccy Currency
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function _getTotalUnsettledExposure(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256 totalExp) {
        EnumerableSet.Bytes32Set storage expCcy = Storage.slot().exposedUnsettledCurrencies[_user];
        uint256 ccyExp;

        for (uint256 i = 0; i < expCcy.length(); i++) {
            bytes32 ccy = expCcy.at(i);
            ccyExp = Storage.slot().unsettledCollateral[_user][ccy];

            if (_ccy == ccy) {
                ccyExp += _unsettledExp;
            }

            totalExp += ccyExp > 0 ? currencyController().convertToETH(ccy, ccyExp) : 0;
        }
    }

    /**
     * @dev Gets the total collateral in all currencies.
     * @param _user User's ethereum address
     */
    function _getTotalCollateral(address _user) internal view returns (uint256) {
        return collateralVault().getTotalIndependentCollateralInETH(_user);
    }

    /**
     * @dev Gets the total collateral used in all currencies.
     * The collateral used is defined as the negative future value in the lending market contract.
     * @param _user User's ethereum address
     */
    function _getUsedCollateral(address _user) internal view returns (uint256) {
        int256 totalPVInETH = lendingMarketController().getTotalPresentValueInETH(_user);
        return totalPVInETH > 0 ? 0 : uint256(-totalPVInETH);
    }

    /**
     * @dev Calculates maximum amount of ETH available to withdraw
     * @param _user User's ethereum address
     */
    function _getWithdrawableCollateral(address _user) internal view returns (uint256) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, "", 0);

        if (totalUsedCollateral == 0) {
            return totalCollateral;
        } else if (
            totalCollateral >
            ((totalUsedCollateral) * CollateralParametersHandler.marginCallThresholdRate()) /
                ProtocolTypes.BP
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            return
                (totalCollateral *
                    ProtocolTypes.BP -
                    (totalUsedCollateral) *
                    CollateralParametersHandler.marginCallThresholdRate()) / ProtocolTypes.BP;
        } else {
            return 0;
        }
    }
}
