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
 * @notice Implements the management of the collateral in each currency for users.
 *
 * This contract manages the following data related to the collateral.
 * - Deposited amount as the collateral
 * - Unsettled collateral amount used by order
 * - Parameters related to the collateral
 *   - Margin Call Threshold Rate
 *   - Auto Liquidation Threshold Rate
 *   - Liquidation Price Rate
 *   - Min Collateral Rate
 *
 * @dev The deposited amount is managed in the CollateralVault contract now. It will be merged to this contract
 * in the future.
 */
contract CollateralAggregator is ICollateralAggregator, MixinAddressResolver, Ownable, Proxyable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Modifier to check if user hasn't been registered yet
     * @param _user User's address
     */
    modifier nonRegisteredUser(address _user) {
        require(!Storage.slot().isRegistered[_user], "User exists");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _marginCallThresholdRate The rate used as the margin call threshold
     * @param _autoLiquidationThresholdRate  The rate used as the auto liquidation threshold
     * @param _liquidationPriceRate The rate used as the liquidation price
     * @param _minCollateralRate The rate used minima collateral
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

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.COLLATERAL_VAULT;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets if the collateral has enough coverage.
     * @param _user User's address
     * @return The boolean if the collateral has sufficient coverage or not
     */
    function isCovered(address _user) public view override returns (bool) {
        return _isCovered(_user, "", 0);
    }

    /**
     * @notice Gets if the user is registered.
     * @param _user User's address
     * @return The boolean if the user is registered or not
     */
    function isRegisteredUser(address _user) external view override returns (bool) {
        return Storage.slot().isRegistered[_user];
    }

    /**
     * @notice Gets the maximum amount of ETH that can be withdrawn from user collateral.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function getWithdrawableCollateral(address _user) external view virtual returns (uint256) {
        return _getWithdrawableCollateral(_user);
    }

    /**
     * @notice Gets the rate of collateral used.
     * @param _user User's address
     * @return The rate of collateral used
     */
    function getCoverage(address _user) public view override returns (uint256) {
        return _getCoverage(_user, "", 0);
    }

    /**
     * @notice Gets unsettled exposure for the selected currency
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return Unsettled exposure
     */
    function getUnsettledCollateral(address _user, bytes32 _ccy) external view returns (uint256) {
        return Storage.slot().unsettledCollateral[_user][_ccy];
    }

    /**
     * @notice Gets the total amount of unused collateral
     * @param _user User's address
     * @return The total amount of unused collateral
     */
    function getUnusedCollateral(address _user) external view returns (uint256) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, "", 0);

        return totalCollateral > totalUsedCollateral ? totalCollateral - totalUsedCollateral : 0;
    }

    /**
     * @notice Gets total unsettled exposure in all currencies.
     * @param _user User's address
     * @return Total unsettled exposure
     */
    function getTotalUnsettledExposure(address _user) external view override returns (uint256) {
        return _getTotalUnsettledExposure(_user, "", 0);
    }

    /**
     * @notice Gets parameters related to collateral.
     * @return marginCallThresholdRate The rate used as the margin call threshold
     * @return autoLiquidationThresholdRate  The rate used as the auto liquidation threshold
     * @return liquidationPriceRate The rate used as the liquidation price
     * @return minCollateralRate The rate used minima collateral
     */
    function getCollateralParameters()
        external
        view
        override
        returns (
            uint256 marginCallThresholdRate,
            uint256 autoLiquidationThresholdRate,
            uint256 liquidationPriceRate,
            uint256 minCollateralRate
        )
    {
        return CollateralParametersHandler.getCollateralParameters();
    }

    /**
     * @notice Register user.
     */
    function register() external override nonRegisteredUser(msg.sender) {
        Storage.slot().isRegistered[msg.sender] = true;

        emit Register(msg.sender);
    }

    /**
     * @notice Locks unsettled collateral for the selected currency.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to be locked in a specified currency
     */
    function useUnsettledCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts {
        Storage.slot().exposedUnsettledCurrencies[_user].add(_ccy);
        require(_isCovered(_user, _ccy, _amount), "Not enough collateral");

        Storage.slot().unsettledCollateral[_user][_ccy] += _amount;

        emit UseUnsettledCollateral(_user, _ccy, _amount);
    }

    /**
     * @notice Releases the amount of unsettled exposure for the selected currency.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to be unlocked from unsettled exposure in a specified currency
     */
    function releaseUnsettledCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts {
        Storage.slot().unsettledCollateral[_user][_ccy] -= _amount;

        if (Storage.slot().unsettledCollateral[_user][_ccy] == 0) {
            Storage.slot().exposedUnsettledCurrencies[_user].remove(_ccy);
        }

        emit ReleaseUnsettled(_user, _ccy, _amount);
    }

    /**
     * @notice Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning.
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
     * @notice Gets if the collateral has enough coverage.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return The boolean if the collateral has enough coverage or not
     */
    function _isCovered(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (bool) {
        uint256 totalCollateral = _getTotalCollateral(_user);
        uint256 totalUsedCollateral = _getUsedCollateral(_user) +
            _getTotalUnsettledExposure(_user, _ccy, _unsettledExp);

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * ProtocolTypes.PCT >=
                totalUsedCollateral * CollateralParametersHandler.marginCallThresholdRate());
    }

    /**
     * @notice Gets the collateral coverage.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return coverage The rate of collateral used
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
     * @notice Gets total unsettled exposure in all currencies.
     * @param _user User's ethereum address
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return totalExp The total collateral amount
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
     * @notice Gets the total collateral in all currencies.
     * @param _user User's address
     * @return The total amount of collateral
     */
    function _getTotalCollateral(address _user) internal view returns (uint256) {
        return collateralVault().getTotalIndependentCollateralInETH(_user);
    }

    /**
     * @notice Gets the total collateral used in all currencies.
     * The collateral used is defined as the negative future value in the lending market contract.
     * @param _user User's address
     * @return The total amount of used collateral
     */
    function _getUsedCollateral(address _user) internal view returns (uint256) {
        int256 totalPVInETH = lendingMarketController().getTotalPresentValueInETH(_user);
        return totalPVInETH > 0 ? 0 : uint256(-totalPVInETH);
    }

    /**
     * @notice Calculates maximum amount of ETH that can be withdrawn.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
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
