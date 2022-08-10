// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./libraries/AddressPacking.sol";
// import "./libraries/NetPV.sol";
import "./interfaces/ICollateralAggregatorV3.sol";
import "./mixins/MixinCollateralManagementV2.sol";
import "./types/ProtocolTypes.sol";

/**
 * @title Collateral Aggregator contract is used to manage Secured Finance
 * protocol collateral obligations and movements of collateral across collateral vaults.
 *
 * This contract handle the calculations of aggregated collateral obligations between users
 * in a bilateral relations, calculations of required rebalancing to stabilize
 * the bilateral position, liquidations using FX rates for all protocol currency pairs to ETH
 *
 * Liquidations and rebalancing operations are handled across all collateral vaults where
 * users have deposited their funds in FIFO order.
 *
 * Contract linked to Product based contracts (like Loan, Swap, etc),
 * LendingMarkets, CurrencyController contracts and Liquidation Engine.
 */
contract CollateralAggregatorV3 is ICollateralAggregatorV3, MixinCollateralManagementV2 {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    // using NetPV for NetPV.CcyNetting;

    /**
     * @dev Modifier to check if user registered already
     */
    modifier registeredUser(address _user) {
        require(Storage.slot().isRegistered[_user], "NOT_REGISTERED");
        _;
    }

    /**
     * @dev Modifier to check if user hasn't been registered yet
     */
    modifier nonRegisteredUser(address _user) {
        require(!Storage.slot().isRegistered[_user], "REGISTERED_ALREADY");
        _;
    }

    // =========== COLLATERAL BOOK SECTION ===========

    /**
     * @dev Register user and store collateral book
     */
    function register() public override nonRegisteredUser(msg.sender) {
        string[] memory _addresses = new string[](0);
        uint256[] memory _chainIds = new uint256[](0);

        _register(_addresses, _chainIds);
    }

    /**
     * @dev Register user and store collateral book
     * @param _addresses Array of other blockchain addresses
     * @param _chainIds Array of chain ids for other blockchains
     */
    function register(string[] memory _addresses, uint256[] memory _chainIds)
        public
        override
        nonRegisteredUser(msg.sender)
    {
        _register(_addresses, _chainIds);
    }

    /**
     * @dev Triggers to lock unsettled collateral on a global book for selected currency.
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
     * @dev Triggers to calculate total unsettled exposure across all currencies
     * @param _user User's address
     */
    function getTotalUnsettledExp(address _user) public view override returns (uint256 exp) {
        (exp, ) = _netTotalUnsettledAndHypotheticalPV(_user, "", 0);
    }

    /**
     * @dev Triggers to check if unsettled collateral exposure covered more that 150% from a global collateral book of `_user`.
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) public view override returns (bool) {
        (uint256 coverage, , ) = _calculateUnsettledCoverage(_user, _ccy, _unsettledExp);
        return coverage >= Storage.slot().marginCallThresholdRate;
    }

    /**
     * @dev Triggers to get maximum amount of ETH available to widthdraw from `_user` collateral book.
     * @param _user User's address
     */
    function getMaxCollateralBookWidthdraw(address _user)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _calcMaxCollateral(_user);
    }

    /**
     * @dev Triggers to get coverage of the global collateral book against all unsettled exposure.
     * @param _user User's address
     */
    function getUnsettledCoverage(address _user) public view override returns (uint256 coverage) {
        (coverage, , ) = _calculateUnsettledCoverage(_user, "", 0);
    }

    /**
     * @dev Triggers to reduce the amount of unsettled exposure in specific `ccy` from a global collateral book of `user`
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

    function checkRegisteredUser(address addr) public view override returns (bool) {
        return Storage.slot().isRegistered[addr];
    }

    function getExposedCurrencies(address partyA, address partyB)
        public
        view
        override
        returns (bytes32[] memory)
    {
        (bytes32 packedAddrs, ) = AddressPacking.pack(partyA, partyB);
        EnumerableSet.Bytes32Set storage expCcy = Storage.slot().exposedCurrencies[packedAddrs];

        uint256 numCcy = expCcy.length();
        bytes32[] memory currencies = new bytes32[](numCcy);

        for (uint256 i = 0; i < numCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            currencies[i] = ccy;
        }

        return currencies;
    }

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256) {
        return Storage.slot().unsettledCollateral[user][ccy];
    }

    // =========== INTERNAL FUNCTIONS ===========

    /**
     * @dev Triggers internaly to store new collateral book
     */
    function _register(string[] memory _addresses, uint256[] memory _chainIds) internal {
        Storage.slot().isRegistered[msg.sender] = true;
        // perform onboarding steps here

        crosschainAddressResolver().updateAddresses(msg.sender, _chainIds, _addresses);

        emit Register(msg.sender);
    }

    function _determineCollateralAdjustment(uint256 _lockedCollateral, uint256 _targetReq)
        internal
        pure
        returns (uint256 amount, bool isWithdraw)
    {
        if (_lockedCollateral > 0 && _targetReq > 0) {
            if (_lockedCollateral > _targetReq) {
                amount = _lockedCollateral - _targetReq;
                isWithdraw = true;
            } else {
                amount = _targetReq - _lockedCollateral;
                isWithdraw = false;
            }
        } else if (_lockedCollateral > 0 && _targetReq == 0) {
            amount = _lockedCollateral;
            isWithdraw = true;
        } else if (_lockedCollateral == 0 && _targetReq > 0) {
            amount = _targetReq;
            isWithdraw = false;
        }

        return (amount, isWithdraw);
    }

    struct NetUnsettledExpLocalVars {
        uint256 totalExp;
        int256 totalPV;
        uint256 ccyExp;
        uint256 ccyExpInETH;
        int256 ccyPV;
        uint256 maxCcy;
    }

    /**
     * @dev Triggers to calculate total unsettled exposure across all currencies against all global collateral books.
     * Also used to calculate hypothetical Net PV with additional exposure in specific `_ccy`
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function _netTotalUnsettledAndHypotheticalPV(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256, int256) {
        EnumerableSet.Bytes32Set storage expCcy = Storage.slot().exposedUnsettledCurrencies[_user];

        NetUnsettledExpLocalVars memory vars;

        vars.maxCcy = expCcy.length();

        for (uint256 i = 0; i < vars.maxCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            vars.ccyExp = Storage.slot().unsettledCollateral[_user][ccy];
            vars.ccyPV = lendingMarketController().getTotalPresentValue(ccy, _user);

            if (_ccy == ccy) {
                vars.ccyExp = vars.ccyExp + _unsettledExp;
            }

            vars.ccyExpInETH = vars.ccyExp > 0
                ? currencyController().convertToETH(ccy, vars.ccyExp)
                : 0;
            vars.totalExp += vars.ccyExpInETH;
            vars.totalPV += vars.ccyPV > int256(0)
                ? currencyController().convertToETH(ccy, vars.ccyPV)
                : int256(0);
        }

        return (vars.totalExp, vars.totalPV);
    }

    struct UnsettledCoverageLocalVars {
        uint256 totalExpInETH;
        int256 totalPVInETH;
        uint256 totalNegativePV;
        uint256 totalCollateral;
        uint256 coverage;
        uint256 independentAmount;
    }

    function _calculateUnsettledCoverage(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        UnsettledCoverageLocalVars memory vars;

        (vars.totalExpInETH, vars.totalPVInETH) = _netTotalUnsettledAndHypotheticalPV(
            _user,
            _ccy,
            _unsettledExp
        );
        vars.totalNegativePV = vars.totalPVInETH > 0 ? 0 : uint256(-vars.totalPVInETH);
        vars.independentAmount = collateralVault().getTotalIndependentCollateralInETH(_user);

        vars.totalCollateral = vars.independentAmount > vars.totalNegativePV
            ? vars.independentAmount - vars.totalNegativePV
            : 0;

        vars.coverage = vars.totalExpInETH == 0
            ? 0
            : (ProtocolTypes.PCT * vars.independentAmount) / vars.totalExpInETH;

        return (vars.coverage, vars.totalExpInETH, vars.totalCollateral);
    }

    struct MaxCollateralBookWidthdrawLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
        uint256 delta;
        uint256 maxWidthdraw;
        uint256 totalCollateral;
    }

    /**
     * @dev Triggers to calculate maximum amount of ETH available to widthdraw from `_user` collateral book
     * @param _user User's ethereum address
     *
     * @return `maxWidthdraw` max widthdrawable amount of ETH
     */
    function _calcMaxCollateral(address _user) internal view returns (uint256) {
        MaxCollateralBookWidthdrawLocalVars memory vars;

        (vars.coverage, vars.totalExpInETH, vars.totalCollateral) = _calculateUnsettledCoverage(
            _user,
            "",
            0
        );

        if (vars.coverage == 0) {
            return vars.totalCollateral;
        } else if (vars.totalCollateral > vars.totalExpInETH * getMarginCallThresholdRate()) {
            vars.maxWidthdraw =
                vars.totalCollateral -
                vars.totalExpInETH *
                getMarginCallThresholdRate();
        } else {
            return 0;
        }

        return vars.maxWidthdraw;
    }
}
