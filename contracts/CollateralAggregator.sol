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
 * @title Collateral Aggregator contract is used to manage Secured Finance
 * protocol collateral obligations and movements of collateral across collateral vaults.
 *
 * This contract handle the calculations of aggregated collateral obligations of user.
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
     * @dev Checks if unsettled collateral exposure covered more that 150% from a global collateral book of `_user`.
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) public view override returns (bool) {
        (uint256 coverage, ) = _getUnsettledCoverage(_user, _ccy, _unsettledExp);
        return coverage >= CollateralParametersHandler.marginCallThresholdRate();
    }

    function isRegisteredUser(address addr) external view override returns (bool) {
        return Storage.slot().isRegistered[addr];
    }

    /**
     * @dev Gets maximum amount of ETH available to withdraw from `_user` collateral book.
     * @param _user User's address
     */
    function getMaxCollateralBookWithdraw(address _user) external view virtual returns (uint256) {
        return _calcMaxCollateral(_user);
    }

    /**
     * @dev Gets coverage of the global collateral book against all unsettled exposure.
     * @param _user User's address
     */
    function getUnsettledCoverage(address _user) external view override returns (uint256 coverage) {
        (coverage, ) = _getUnsettledCoverage(_user, "", 0);
    }

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256) {
        return Storage.slot().unsettledCollateral[user][ccy];
    }

    /**
     * @dev Calculates total unsettled exposure across all currencies
     * @param _user User's address
     */
    function getTotalUnsettledExp(address _user) external view override returns (uint256) {
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
     * @param amount Amount of funds to be locked in Ccy for user
     */
    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external override onlyAcceptedContracts {
        Storage.slot().exposedUnsettledCurrencies[user].add(ccy);
        require(isCoveredUnsettled(user, ccy, amount), "Not enough collateral");

        Storage.slot().unsettledCollateral[user][ccy] += amount;

        emit UseUnsettledCollateral(user, ccy, amount);
    }

    /**
     * @dev Reduces the amount of unsettled exposure in specific `ccy` from a global collateral book of `user`
     * @param user User's ETH address
     * @param ccy Specified currency of the deal
     * @param amount Amount of funds to be unlocked from unsettled exposure in specified ccy
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
     * @dev Calculates total unsettled exposure across all currencies against all global collateral books.
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
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

    function _getUnsettledCoverage(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256 coverage, uint256 totalExpInETH) {
        totalExpInETH = _getTotalUnsettledExposure(_user, _ccy, _unsettledExp);
        uint256 independentAmount = collateralVault().getTotalIndependentCollateralInETH(_user);

        coverage = totalExpInETH == 0 ? 0 : (ProtocolTypes.PCT * independentAmount) / totalExpInETH;
    }

    function _getTotalCollateral(address _user) internal view returns (uint256) {
        int256 totalPVInETH = lendingMarketController().getTotalPresentValueInETH(_user);
        uint256 totalNegativePV = totalPVInETH > 0 ? 0 : uint256(-totalPVInETH);
        uint256 independentAmount = collateralVault().getTotalIndependentCollateralInETH(_user);

        return independentAmount > totalNegativePV ? independentAmount - totalNegativePV : 0;
    }

    struct MaxCollateralBookWithdrawLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
        uint256 maxWithdraw;
        uint256 totalCollateral;
    }

    /**
     * @dev Calculates maximum amount of ETH available to withdraw from `_user` collateral book
     * @param _user User's ethereum address
     *
     * @return `maxWithdraw` max withdrawable amount of ETH
     */
    function _calcMaxCollateral(address _user) internal view returns (uint256) {
        MaxCollateralBookWithdrawLocalVars memory vars;

        (vars.coverage, vars.totalExpInETH) = _getUnsettledCoverage(_user, "", 0);
        vars.totalCollateral = _getTotalCollateral(_user);

        if (vars.coverage == 0) {
            return vars.totalCollateral;
        } else if (
            vars.totalCollateral >
            (vars.totalExpInETH * CollateralParametersHandler.marginCallThresholdRate()) /
                ProtocolTypes.BP
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - (totalExposure * marginCallThresholdRate).
            vars.maxWithdraw =
                (vars.totalCollateral *
                    ProtocolTypes.BP -
                    vars.totalExpInETH *
                    CollateralParametersHandler.marginCallThresholdRate()) /
                ProtocolTypes.BP;
        } else {
            return 0;
        }

        return vars.maxWithdraw;
    }
}
