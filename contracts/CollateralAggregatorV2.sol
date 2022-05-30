// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./libraries/AddressPacking.sol";
import "./libraries/NetPV.sol";
import "./ProtocolTypes.sol";
import "./mixins/MixinCollateralManagement.sol";

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
contract CollateralAggregatorV2 is ICollateralAggregator, ProtocolTypes, MixinCollateralManagement {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.AddressSet;
    using NetPV for NetPV.CcyNetting;

    // Mapping for total amount of collateral locked against independent collateral from all books.
    mapping(address => mapping(bytes32 => uint256)) public unsettledCollateral;

    // Mapping for used currencies in unsettled exposures.
    mapping(address => EnumerableSet.Bytes32Set) private exposedUnsettledCurrencies;

    // Mapping for all registered users.
    mapping(address => bool) private isRegistered;

    // Mapping for used currencies set in bilateral position.
    mapping(bytes32 => EnumerableSet.Bytes32Set) private exposedCurrencies;

    // Mapping for used collateral vaults in bilateral position.
    mapping(bytes32 => EnumerableSet.AddressSet) private usedVaultsInPosition;

    // Mapping for used collateral vaults per user.
    mapping(address => EnumerableSet.AddressSet) private usedVaults;

    // Mapping for exposures per currency in bilateral position.
    mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) private ccyNettings;

    /**
     * @dev Modifier to check if user registered already
     */
    modifier registeredUser(address _user) {
        require(isRegistered[_user], "NOT_REGISTERED");
        _;
    }

    /**
     * @dev Modifier to check if user hasn't been registered yet
     */
    modifier nonRegisteredUser(address _user) {
        require(!isRegistered[_user], "REGISTERED_ALREADY");
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinCollateralManagement(_resolver) {}

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

    // TODO: Rebalance from position to book once position coverage more than 150%

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
        exposedUnsettledCurrencies[user].add(ccy);
        require(isCoveredUnsettled(user, ccy, amount), "Not enough collateral");

        unsettledCollateral[user][ccy] = unsettledCollateral[user][ccy].add(amount);

        emit UseUnsettledCollateral(user, ccy, amount);
    }

    /**
     * @dev Triggers to lock collateral using ETH rate for selected currency.
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be locked in Ccy for counterparty A
     * @param amount1 Amount of funds to be locked in Ccy for counterparty B
     */
    function useCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external override onlyAcceptedContracts {
        (bytes32 packedAddrs, ) = AddressPacking.pack(partyA, partyB);
        exposedCurrencies[packedAddrs].add(ccy);

        NetPV.use(ccyNettings, partyA, partyB, ccy, amount0, amount1, isSettled);
        _rebalanceIfRequired(partyA, partyB, true);

        emit UseCollateral(partyA, partyB, ccy, amount0, amount1, isSettled);
    }

    /**
     * @dev Triggers to lock collateral using ETH rate for selected currency.
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be locked in Ccy for counterparty A
     * @param amount1 Amount of funds to be locked in Ccy for counterparty B
     */
    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) external override onlyAcceptedContracts {
        NetPV.settle(ccyNettings, partyA, partyB, ccy, amount0, amount1);
        _rebalanceIfRequired(partyA, partyB, true);

        emit SettleCollateral(partyA, partyB, ccy, amount0, amount1);
    }

    /**
     * @dev Triggers to calculate total unsettled exposure across all currencies
     * @param _user User's address
     */
    function getTotalUnsettledExp(address _user) public view override returns (uint256) {
        return _netTotalUnsettledAndHypotheticalPV(_user, "", 0);
    }

    /**
     * @dev Triggers to calculate netted exposures across all currencies with applied haircuts
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     */
    function getNetAndTotalPV(address _party0, address _party1)
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return _netTotalAndHypotheticalPV(_party0, _party1, "", 0, 0, false);
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
        (uint256 coverage, ) = _calculateUnsettledCoverageAndTotalExposure(
            _user,
            _ccy,
            _unsettledExp
        );
        return coverage >= MARGINLEVEL;
    }

    /**
     * @dev Triggers to check if collateral covered more that 150%.
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     * @param _ccy Currency to calculate additional PV for
     * @param _party0PV Counterparty A additional present value
     * @param _party1PV Counterparty B additional present value
     */
    function isCovered(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) public view override returns (bool, bool) {
        (uint256 cover0, uint256 cover1) = _calculateCoverage(
            _party0,
            _party1,
            _ccy,
            _party0PV,
            _party1PV,
            _isSettled
        );

        return (cover0 >= MARGINLEVEL, cover1 >= MARGINLEVEL);
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
        returns (uint256 maxWithdraw)
    {
        (maxWithdraw, ) = _calcMaxCollateralWidthdrawFromBook(_user);
    }

    /**
     * @dev Triggers to get maximum amount of ETH available to
     * widthdraw from bilateral position between `party0` and `_party1`.
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     */
    function getMaxCollateralWidthdraw(address _party0, address _party1)
        public
        view
        virtual
        override
        returns (uint256, uint256)
    {
        uint256 colAdjustment0;
        bool isWithdraw0;
        uint256 colAdjustment1;
        bool isWithdraw1;

        (colAdjustment0, isWithdraw0, colAdjustment1, isWithdraw1) = _calcCollateralAdjustment(
            _party0,
            _party1,
            "",
            0,
            0,
            false,
            true
        );

        return (isWithdraw0 ? colAdjustment0 : 0, isWithdraw1 ? colAdjustment1 : 0);
    }

    /**
     * @dev Triggers to get coverage of the global collateral book against all unsettled exposure.
     * @param _user User's address
     */
    function getUnsettledCoverage(address _user) public view override returns (uint256 coverage) {
        (coverage, ) = _calculateUnsettledCoverageAndTotalExposure(_user, "", 0);
    }

    /**
     * @dev Triggers to get coverage of the global collateral book against all unsettled exposure.
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     */
    function getRebalanceCollateralAmounts(address _party0, address _party1)
        public
        view
        override
        returns (uint256, uint256)
    {
        uint256 colAdjustment0;
        bool isWithdraw0;
        uint256 colAdjustment1;
        bool isWithdraw1;

        (colAdjustment0, isWithdraw0, colAdjustment1, isWithdraw1) = _calcCollateralAdjustment(
            _party0,
            _party1,
            "",
            0,
            0,
            false,
            true
        );

        return (isWithdraw0 ? 0 : colAdjustment0, isWithdraw1 ? 0 : colAdjustment1);
    }

    /**
     * @dev Triggers to get bilateral position collateral coverage.
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     */
    function getCoverage(address _party0, address _party1)
        public
        view
        override
        returns (uint256, uint256)
    {
        return _calculateCoverage(_party0, _party1, "", 0, 0, false);
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
        unsettledCollateral[user][ccy] = unsettledCollateral[user][ccy].sub(amount);

        if (unsettledCollateral[user][ccy] == 0) {
            exposedUnsettledCurrencies[user].remove(ccy);
        }

        emit ReleaseUnsettled(user, ccy, amount);
    }

    /**
     * @dev Triggers to reduce PV for specific `ccy` in bilateral position between `partyA` and `partyB`
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be removed in CcyNetting for counterparty A
     * @param amount1 Amount of funds to be removed in CcyNetting for counterparty B
     */
    function releaseCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external override onlyAcceptedContracts {
        (bytes32 packedAddrs, ) = AddressPacking.pack(partyA, partyB);
        require(exposedCurrencies[packedAddrs].contains(ccy), "non-used ccy");

        NetPV.release(ccyNettings, partyA, partyB, ccy, amount0, amount1, isSettled);
        _rebalanceIfRequired(partyA, partyB, true);

        emit Release(partyA, partyB, ccy, amount0, amount1, isSettled);
    }

    /**
     * @dev Triggers to update PV value in currency for bilateral position
     * changes present value in native currency, without exchange rate conversion
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     * @param ccy Specified currency of the deal
     * @param prevPV0 Previous present value to be substracted from total exposure for counterparty A
     * @param prevPV1 Previous present value to be substracted from total exposure for counterparty B
     * @param currentPV0 Current present value to be added to total exposure for counterparty A
     * @param currentPV1 Current present value to be added to total exposure for counterparty B
     */
    function updatePV(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) external override onlyAcceptedContracts {
        NetPV.update(ccyNettings, party0, party1, ccy, prevPV0, prevPV1, currentPV0, currentPV1);

        _rebalanceIfRequired(party0, party1, true);

        emit UpdatePV(party0, party1, ccy, prevPV0, prevPV1, currentPV0, currentPV1);
    }

    /**
     * @dev Triggers to liquidate collateral between `from` and `to` parties
     * works with aggregated liquidation amount in ETH
     *
     * @param from Address for liquidating collateral from
     * @param to Address for sending collateral to
     * @param liquidationInETH Liquidation amount in Ccy
     */
    function liquidate(
        address from,
        address to,
        uint256 liquidationInETH
    ) external override onlyLiquidations {
        require(
            _liquidateCollateralAcrossVaults(from, to, liquidationInETH),
            "INCORRECT_LIQUIDATION_ACROSS_VAULTS"
        );
    }

    /**
     * @dev Triggers to liquidate collateral between `from` and `to` parties
     * works liquidation amount in native `ccy`
     *
     * @param from Address for liquidating collateral from
     * @param to Address for sending collateral to
     * @param ccy Short identifier of currency used to liquidate
     * @param liquidationAmount Liquidation amount in Ccy
     * @param isSettled Identifier wether collateral obligations for release is settled
     */
    function liquidate(
        address from,
        address to,
        bytes32 ccy,
        uint256 liquidationAmount,
        uint256 pv,
        bool isSettled
    ) external override onlyAcceptedContracts {
        uint256 liquidationTarget = liquidationAmount.mul(LQLEVEL).div(BP);
        uint256 liqudationInETH = currencyController().convertToETH(ccy, liquidationTarget);

        require(
            _liquidateCollateralAcrossVaults(from, to, liqudationInETH),
            "INCORRECT_LIQUIDATION_ACROSS_VAULTS"
        );

        emit Liquidate(from, to, ccy, liquidationAmount);

        NetPV.release(ccyNettings, from, to, ccy, pv, 0, isSettled);

        emit Release(from, to, ccy, pv, 0, isSettled);

        _rebalanceIfRequired(from, to, true);
    }

    function checkRegisteredUser(address addr) public view override returns (bool) {
        return isRegistered[addr];
    }

    function getCcyExposures(
        address partyA,
        address partyB,
        bytes32 ccy
    )
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        (bytes32 packedAddrs, ) = AddressPacking.pack(partyA, partyB);
        require(exposedCurrencies[packedAddrs].contains(ccy), "non-used ccy");
        NetPV.CcyNetting memory netting = NetPV.get(ccyNettings, partyA, partyB, ccy);

        return (netting.unsettled0PV, netting.unsettled1PV, netting.party0PV, netting.party1PV);
    }

    function getExposedCurrencies(address partyA, address partyB)
        public
        view
        override
        returns (bytes32[] memory)
    {
        (bytes32 packedAddrs, ) = AddressPacking.pack(partyA, partyB);
        EnumerableSet.Bytes32Set storage expCcy = exposedCurrencies[packedAddrs];

        uint256 numCcy = expCcy.length();
        bytes32[] memory currencies = new bytes32[](numCcy);

        for (uint256 i = 0; i < numCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            currencies[i] = ccy;
        }

        return currencies;
    }

    function getUsedVaults(address party0, address party1)
        public
        view
        override
        returns (address[] memory)
    {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        EnumerableSet.AddressSet storage vaultsSet = usedVaultsInPosition[packedAddrs];

        uint256 numVaults = vaultsSet.length();
        address[] memory vaults = new address[](numVaults);

        for (uint256 i = 0; i < numVaults; i++) {
            address vault = vaultsSet.at(i);
            vaults[i] = vault;
        }

        return vaults;
    }

    function getUsedVaults(address user) public view override returns (address[] memory) {
        EnumerableSet.AddressSet storage vaultsSet = usedVaults[user];

        uint256 numVaults = vaultsSet.length();
        address[] memory vaults = new address[](numVaults);

        for (uint256 i = 0; i < numVaults; i++) {
            address vault = vaultsSet.at(i);
            vaults[i] = vault;
        }

        return vaults;
    }

    // =========== INTERNAL FUNCTIONS ===========

    /**
     * @dev Triggers internaly to store new collateral book
     */
    function _register(string[] memory _addresses, uint256[] memory _chainIds) internal {
        isRegistered[msg.sender] = true;
        // perform onboarding steps here

        crosschainAddressResolver().updateAddresses(msg.sender, _chainIds, _addresses);

        emit Register(msg.sender);
    }

    struct NetAndTotalPVLocalVars {
        bytes32 packedAddrs;
        bytes32 ccy;
        NetPV.CcyNetting netting;
        uint256 exchangeRate;
        uint256 totalUnsettledPV0inETH;
        uint256 totalUnsettledPV1inETH;
        uint256 totalPV0inETH;
        uint256 totalPV1inETH;
        uint256 totalCombinedPV0inETH;
        uint256 totalCombinedPV1inETH;
        uint256 totalHaircutPV0;
        uint256 totalHaircutPV1;
        uint256 haircutRatio;
        uint256 pvDiff0;
        uint256 pvDiff1;
        uint256 netPV0;
        uint256 netPV1;
        uint256 maxCcy;
    }

    /**
     * @dev Triggers to calculate netted exposures across all currencies with applied haircuts.
     * Also used to calculate hypothetical Net PV with additional exposure in specific `_ccy`
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     * @param _ccy Currency to calculate additional PV for
     * @param _party0PV Counterparty A additional present value
     * @param _party1PV Counterparty B additional present value
     */
    function _netTotalAndHypotheticalPV(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool isSettled
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        NetAndTotalPVLocalVars memory vars;
        (vars.packedAddrs, ) = AddressPacking.pack(_party0, _party1);
        EnumerableSet.Bytes32Set storage expCcy = exposedCurrencies[vars.packedAddrs];

        vars.maxCcy = expCcy.length();

        for (uint256 i = 0; i < vars.maxCcy; i++) {
            vars.ccy = expCcy.at(i);

            if (_ccy == vars.ccy) {
                vars.netting = NetPV.get(
                    ccyNettings,
                    _party0,
                    _party1,
                    vars.ccy,
                    _party0PV,
                    _party1PV,
                    isSettled
                );
            } else {
                vars.netting = NetPV.get(ccyNettings, _party0, _party1, vars.ccy);
            }

            vars.exchangeRate = uint256(currencyController().getLastETHPrice(vars.ccy));
            vars.netting = _convertPositionToETH(vars.netting, vars.exchangeRate);

            vars.totalUnsettledPV0inETH = vars.totalUnsettledPV0inETH.add(
                vars.netting.unsettled0PV
            );
            vars.totalUnsettledPV1inETH = vars.totalUnsettledPV1inETH.add(
                vars.netting.unsettled1PV
            );

            vars.haircutRatio = currencyController().getHaircut(vars.ccy);

            vars.totalPV0inETH = vars.totalPV0inETH.add(vars.netting.party0PV);
            vars.totalPV1inETH = vars.totalPV1inETH.add(vars.netting.party1PV);
            vars.totalHaircutPV0 = vars.totalHaircutPV0.add(
                vars.netting.party0PV.mul(vars.haircutRatio).div(BP)
            );
            vars.totalHaircutPV1 = vars.totalHaircutPV1.add(
                vars.netting.party1PV.mul(vars.haircutRatio).div(BP)
            );
        }

        vars.pvDiff0 = vars.totalPV0inETH >= vars.totalHaircutPV1
            ? vars.totalPV0inETH.sub(vars.totalHaircutPV1)
            : 0;
        vars.pvDiff1 = vars.totalPV1inETH >= vars.totalHaircutPV0
            ? vars.totalPV1inETH.sub(vars.totalHaircutPV0)
            : 0;

        (vars.netPV0, vars.netPV1) = vars.pvDiff0 > vars.pvDiff1
            ? (
                vars.pvDiff0.sub(vars.pvDiff1).add(vars.totalUnsettledPV0inETH),
                vars.totalUnsettledPV1inETH
            )
            : (
                vars.totalUnsettledPV0inETH,
                vars.pvDiff1.sub(vars.pvDiff0).add(vars.totalUnsettledPV1inETH)
            );

        vars.totalCombinedPV0inETH = vars.totalUnsettledPV0inETH.add(vars.totalPV0inETH);
        vars.totalCombinedPV1inETH = vars.totalUnsettledPV1inETH.add(vars.totalPV1inETH);

        return (vars.netPV0, vars.netPV1, vars.totalCombinedPV0inETH, vars.totalCombinedPV1inETH);
    }

    function _convertPositionToETH(NetPV.CcyNetting memory netting, uint256 exchangeRate)
        internal
        pure
        returns (NetPV.CcyNetting memory)
    {
        if (netting.unsettled0PV > 0) {
            netting.unsettled0PV = netting.unsettled0PV.mul(exchangeRate).div(1e18);
        }

        if (netting.unsettled1PV > 0) {
            netting.unsettled1PV = netting.unsettled1PV.mul(exchangeRate).div(1e18);
        }

        if (netting.party0PV > 0) {
            netting.party0PV = netting.party0PV.mul(exchangeRate).div(1e18);
        }

        if (netting.party1PV > 0) {
            netting.party1PV = netting.party1PV.mul(exchangeRate).div(1e18);
        }

        return netting;
    }

    struct CollateralReqLocalVars {
        uint256 net0;
        uint256 net1;
        uint256 total0;
        uint256 total1;
        uint256 minMarginReq0;
        uint256 minMarginReq1;
        uint256 req0;
        uint256 req1;
    }

    /**
     * @dev Triggers to calculate collateral coverage for bilateral position with/without additional PV
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `cover0`, `cover1` uint256 coverage percentages in basis point per counterparty
     */
    // TODO: NOW
    function _calculateCollateralRequirements(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) internal view returns (uint256, uint256) {
        CollateralReqLocalVars memory vars;

        (vars.net0, vars.net1, vars.total0, vars.total1) = _netTotalAndHypotheticalPV(
            _party0,
            _party1,
            _ccy,
            _party0PV,
            _party1PV,
            _isSettled
        );

        vars.minMarginReq0 = vars.total0.mul(MIN_COLLATERAL_RATIO).div(BP);
        vars.minMarginReq1 = vars.total1.mul(MIN_COLLATERAL_RATIO).div(BP);

        if (vars.net0 > 0) {
            vars.req0 = vars.minMarginReq0 > (vars.net0.mul(MARGINLEVEL)).div(BP)
                ? vars.minMarginReq0
                : vars.net0;
        } else {
            vars.req0 = vars.minMarginReq0;
        }

        if (vars.net1 > 0) {
            vars.req1 = vars.minMarginReq1 > (vars.net1.mul(MARGINLEVEL)).div(BP)
                ? vars.minMarginReq1
                : vars.net1;
        } else {
            vars.req1 = vars.minMarginReq1;
        }

        return (vars.req0, vars.req1);
    }

    struct CoverageCalcLocalVars {
        uint256 req0;
        uint256 req1;
        uint256 cover0;
        uint256 cover1;
        uint256 lockedCollateral0;
        uint256 lockedCollateral1;
    }

    /**
     * @dev Triggers to calculate collateral coverage for bilateral position with/without additional PV
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `cover0`, `cover1` uint256 coverage percentages in basis point per counterparty
     */
    // TODO: NOW
    function _calculateCoverage(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) internal view returns (uint256, uint256) {
        CoverageCalcLocalVars memory vars;

        (vars.req0, vars.req1) = _calculateCollateralRequirements(
            _party0,
            _party1,
            _ccy,
            _party0PV,
            _party1PV,
            _isSettled
        );

        (vars.lockedCollateral0, vars.lockedCollateral1) = _totalLockedCollateralInPosition(
            _party0,
            _party1
        );

        if (vars.req0 > 0) {
            vars.cover0 = (PCT.mul(vars.lockedCollateral0)).div(vars.req0);
        }

        if (vars.req1 > 0) {
            vars.cover1 = (PCT.mul(vars.lockedCollateral1)).div(vars.req1);
        }

        return (vars.cover0, vars.cover1);
    }

    struct RequiredCollateralAdjustmentLocalVars {
        uint256 targetReq0;
        uint256 targetReq1;
        uint256 colAdjustment0;
        bool isWithdraw0;
        uint256 colAdjustment1;
        bool isWithdraw1;
        uint256 lockedCollateral0;
        uint256 lockedCollateral1;
    }

    function _calcCollateralAdjustment(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _amount0,
        uint256 _amount1,
        bool _isSettled,
        bool _safeRebalance
    )
        internal
        view
        returns (
            uint256,
            bool,
            uint256,
            bool
        )
    {
        RequiredCollateralAdjustmentLocalVars memory vars;

        (vars.targetReq0, vars.targetReq1) = _calculateCollateralRequirements(
            _party0,
            _party1,
            _ccy,
            _amount0,
            _amount1,
            _isSettled
        );

        if (_safeRebalance) {
            vars.targetReq0 = vars.targetReq0.mul(MARGINLEVEL).div(BP);
            vars.targetReq1 = vars.targetReq1.mul(MARGINLEVEL).div(BP);
        }

        (vars.lockedCollateral0, vars.lockedCollateral1) = _totalLockedCollateralInPosition(
            _party0,
            _party1
        );

        (vars.colAdjustment0, vars.isWithdraw0) = _determineCollateralAdjustment(
            vars.lockedCollateral0,
            vars.targetReq0
        );
        (vars.colAdjustment1, vars.isWithdraw1) = _determineCollateralAdjustment(
            vars.lockedCollateral1,
            vars.targetReq1
        );

        return (vars.colAdjustment0, vars.isWithdraw0, vars.colAdjustment1, vars.isWithdraw1);
    }

    function _determineCollateralAdjustment(uint256 _lockedCollateral, uint256 _targetReq)
        internal
        pure
        returns (uint256 amount, bool isWithdraw)
    {
        if (_lockedCollateral > 0 && _targetReq > 0) {
            if (_lockedCollateral > _targetReq) {
                amount = _lockedCollateral.sub(_targetReq);
                isWithdraw = true;
            } else {
                amount = _targetReq.sub(_lockedCollateral);
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
        uint256 ccyExp;
        uint256 ccyExpInETH;
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
    ) internal view returns (uint256) {
        EnumerableSet.Bytes32Set storage expCcy = exposedUnsettledCurrencies[_user];

        NetUnsettledExpLocalVars memory vars;

        vars.maxCcy = expCcy.length();

        for (uint256 i = 0; i < vars.maxCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            vars.ccyExp = unsettledCollateral[_user][ccy];

            if (_ccy == ccy) {
                vars.ccyExp = vars.ccyExp.add(_unsettledExp);
            }

            vars.ccyExpInETH = currencyController().convertToETH(ccy, vars.ccyExp);
            vars.totalExp = vars.totalExp.add(vars.ccyExpInETH);
        }

        return vars.totalExp;
    }

    struct UnsettledCoverageLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
        uint256 independentAmount;
    }

    function _calculateUnsettledCoverageAndTotalExposure(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256, uint256) {
        UnsettledCoverageLocalVars memory vars;

        vars.totalExpInETH = _netTotalUnsettledAndHypotheticalPV(_user, _ccy, _unsettledExp);
        vars.independentAmount = _totalIndependentCollateralInETH(_user);

        if (vars.totalExpInETH > 0) {
            vars.coverage = (PCT.mul(vars.independentAmount)).div(vars.totalExpInETH);
        } else {
            return (0, vars.totalExpInETH);
        }

        return (vars.coverage, vars.totalExpInETH);
    }

    struct MaxCollateralBookWidthdrawLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
        uint256 delta;
        uint256 maxWidthdraw;
        uint256 independentAmount;
    }

    /**
     * @dev Triggers to calculate maximum amount of ETH available to widthdraw from `_user` collateral book
     * @param _user User's ethereum address
     *
     * @return `maxWidthdraw` max widthdrawable amount of ETH
     */
    function _calcMaxCollateralWidthdrawFromBook(address _user)
        internal
        view
        returns (uint256, uint256)
    {
        MaxCollateralBookWidthdrawLocalVars memory vars;

        (vars.coverage, vars.totalExpInETH) = _calculateUnsettledCoverageAndTotalExposure(
            _user,
            "",
            0
        );
        vars.independentAmount = _totalIndependentCollateralInETH(_user);

        if (vars.coverage > MARGINLEVEL) {
            // TODO: discuss if it makes sense to decrease to 100%
            vars.delta = vars.coverage.sub(MARGINLEVEL);

            vars.maxWidthdraw = vars.independentAmount.mul(vars.delta).div(vars.coverage);
        } else if (vars.totalExpInETH == 0) {
            return (vars.independentAmount, vars.totalExpInETH);
        } else {
            return (0, vars.totalExpInETH);
        }

        return (vars.maxWidthdraw, vars.totalExpInETH);
    }

    struct TotalLockedCollateralLocalVars {
        uint256 len;
        uint256 lockedCollateral0;
        uint256 lockedCollateral1;
        uint256 totalCollateral0;
        uint256 totalCollateral1;
    }

    function _totalLockedCollateralInPosition(address _party0, address _party1)
        internal
        view
        returns (uint256, uint256)
    {
        (bytes32 packedAddrs, ) = AddressPacking.pack(_party0, _party1);
        EnumerableSet.AddressSet storage vaults = usedVaultsInPosition[packedAddrs];

        TotalLockedCollateralLocalVars memory vars;
        vars.len = vaults.length();

        for (uint256 i = 0; i < vars.len; i++) {
            address vaultAddr = vaults.at(i);

            (vars.lockedCollateral0, vars.lockedCollateral1) = ICollateralVault(vaultAddr)
                .getLockedCollateralInETH(_party0, _party1);

            vars.totalCollateral0 = vars.totalCollateral0.add(vars.lockedCollateral0);
            vars.totalCollateral1 = vars.totalCollateral1.add(vars.lockedCollateral1);
        }

        return (vars.totalCollateral0, vars.totalCollateral1);
    }

    function _totalIndependentCollateralInETH(address _party) internal view returns (uint256) {
        EnumerableSet.AddressSet storage vaults = usedVaults[_party];
        uint256 lockedCollateral;
        uint256 totalCollateral;

        uint256 len = vaults.length();

        for (uint256 i = 0; i < len; i++) {
            address vaultAddr = vaults.at(i);
            lockedCollateral = ICollateralVault(vaultAddr).getIndependentCollateralInETH(_party);

            totalCollateral = totalCollateral.add(lockedCollateral);
        }

        return totalCollateral;
    }

    function _liquidateCollateralAcrossVaults(
        address _from,
        address _to,
        uint256 _liquidationTarget
    ) internal returns (bool) {
        EnumerableSet.AddressSet storage vaults = usedVaults[_from];
        uint256 len = vaults.length();
        uint256 i = 0;

        while (_liquidationTarget != 0 && i < len) {
            address vaultAddr = vaults.at(i);
            _liquidationTarget = ICollateralVault(vaultAddr).liquidate(
                _from,
                _to,
                _liquidationTarget
            );

            i += 1;
        }

        if (_liquidationTarget > 0) return false;

        return true;
    }

    function _rebalanceCollateralAcrossVaults(
        address _party0,
        address _party1,
        uint256 _rebalanceTarget,
        bool isRebalanceFrom
    ) internal returns (bool) {
        EnumerableSet.AddressSet storage vaults = usedVaults[_party0];
        uint256 len = vaults.length();
        uint256 i = 0;

        while (_rebalanceTarget != 0 && i < len) {
            address vaultAddr = vaults.at(i);

            if (isRebalanceFrom) {
                _rebalanceTarget = ICollateralVault(vaultAddr).rebalanceFrom(
                    _party0,
                    _party1,
                    _rebalanceTarget
                );
            } else {
                _rebalanceTarget = ICollateralVault(vaultAddr).rebalanceTo(
                    _party0,
                    _party1,
                    _rebalanceTarget
                );
            }

            i += 1;
        }

        if (_rebalanceTarget > 0) return false;

        return true;
    }

    function _rebalanceIfRequired(
        address _party0,
        address _party1,
        bool _safeRebalance
    ) internal {
        (
            uint256 rebalance0,
            bool isRebalanceFrom0,
            uint256 rebalance1,
            bool isRebalanceFrom1
        ) = _calcCollateralAdjustment(_party0, _party1, "", 0, 0, false, _safeRebalance);

        if (rebalance0 > 0) {
            require(
                _rebalanceCollateralAcrossVaults(_party0, _party1, rebalance0, isRebalanceFrom0),
                "NON_ENOUGH_FUNDS_FOR_REBALANCE"
            );
        }

        if (rebalance1 > 0) {
            require(
                _rebalanceCollateralAcrossVaults(_party1, _party0, rebalance1, isRebalanceFrom1),
                "NON_ENOUGH_FUNDS_FOR_REBALANCE"
            );
        }
    }

    function enterVault(address _user) external override onlyCollateralVault {
        usedVaults[_user].add(msg.sender);
    }

    function exitVault(address _user) external override onlyCollateralVault {
        usedVaults[_user].remove(msg.sender);
    }

    function enterVault(address _party0, address _party1) external override onlyCollateralVault {
        (bytes32 packedAddrs, ) = AddressPacking.pack(_party0, _party1);
        usedVaultsInPosition[packedAddrs].add(msg.sender);
    }

    function exitVault(address _party0, address _party1) external override onlyCollateralVault {
        (bytes32 packedAddrs, ) = AddressPacking.pack(_party0, _party1);
        usedVaultsInPosition[packedAddrs].remove(msg.sender);
    }
}
