// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProtocolTypes.sol";
import "./interfaces/IProductWithOneLeg.sol";
import "./libraries/DealId.sol";
import "./libraries/DiscountFactor.sol";
import "./libraries/BokkyPooBahsDateTimeLibrary.sol";
import "./mixins/MixinAddressResolver.sol";

/**
 * @title LoanV2 contract is used to store Lending deals in Secured Finance
 * protocol. This contract handle the PV updates on lending market rate changes
 * also allowing parties to mutually terminate their lending deals
 *
 * Contract linked to Lending Market contracts, LendingMarketController and Collateral contract.
 */
contract LoanV2 is
    ProtocolTypes,
    IProductWithOneLeg,
    MixinAddressResolver,
    Ownable
{
    using SafeMath for uint256;

    uint256 constant NOTICE = 2 weeks;
    uint256 constant SETTLE = 2 days;
    uint256 constant MAXPAYNUM = 6;
    bytes4 constant prefix = 0x21aaa47b;
    uint16 private constant VERSION = 1;
    uint256 public settlementWindow = 2;
    uint8 public paymentFrequency = uint8(PaymentFrequency.ANNUAL);

    struct LoanDeal {
        address lender;
        address borrower;
        bytes32 ccy;
        uint256 term;
        uint256 notional;
        uint256 rate;
        uint256 start;
        uint256 end;
        uint256 pv;
        bytes32 startTxHash;
    }

    struct Termination {
        address terminationAsker;
        uint256 terminationDate;
    }

    /**
     * @dev Mapping for all storing LoanDeals per loanIDs.
     */
    mapping(bytes32 => LoanDeal) private loans;
    mapping(bytes32 => Termination) private terminations;
    mapping(bytes32 => bool) private isSettled;

    bool public isTransferable;
    uint256 public last_loan_id = 0;

    mapping(bytes32 => mapping(uint256 => address)) public lendingMarkets;

    /**
     * @dev Modifier to check if LendingMarket contract linked with this contract
     * @param _ccy LendingMarket currency
     * @param _term LendingMarket term
     */
    modifier lendingMarketExists(bytes32 _ccy, uint256 _term) {
        require(lendingMarkets[_ccy][_term] == msg.sender);
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the loan deal is active.
     * @param loanId Loan deal ID
     */
    modifier workingLoan(bytes32 loanId) {
        require(isSettled[loanId], "loan is not working");
        _;
    }

    /**
     * @dev Contract constructor function.
     * @notice sets contract deployer as owner of this contract
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver)
        public
        MixinAddressResolver(_resolver)
        Ownable()
    {}

    function requiredContracts()
        public
        view
        override
        returns (bytes32[] memory contracts)
    {
        contracts = new bytes32[](4);
        contracts[0] = CONTRACT_COLLATERAL_AGGREGATOR;
        contracts[1] = CONTRACT_LENDING_MARKET_CONTROLLER;
        contracts[2] = CONTRACT_PAYMENT_AGGREGATOR;
        contracts[3] = CONTRACT_TERM_STRUCTURE;
    }

    /**
     * @dev Triggers to change ability to transfer loan ownership by lenders.
     * @param isAccepted Boolean to
     *
     * @notice Executed only by contract owner
     */
    function setIsTransferable(bool isAccepted) public onlyOwner {
        isTransferable = isAccepted;
    }

    /**
     * @dev Triggers to link with existing LendingMarket.
     * @param _ccy LendingMarket main currency
     * @param _term LendingMarket term
     * @param addr LendingMarket contract address
     *
     * @notice Executed only by contract owner
     */
    function addLendingMarket(
        bytes32 _ccy,
        uint256 _term,
        address addr
    ) public onlyOwner {
        require(
            lendingMarkets[_ccy][_term] == address(0),
            "Couldn't rewrite existing market"
        );
        lendingMarkets[_ccy][_term] = addr;
    }

    /**
     * @dev Internal function to generate deal id based on product prefix and deals counter
     */
    function _generateDealId() internal returns (bytes32 id) {
        last_loan_id += 1;
        id = DealId.generate(prefix, last_loan_id);
    }

    /**
     * @dev Triggered to register new loan deal, also locks borrowers collateral.
     * @param maker LendingMarket order market maker
     * @param taker LendingMarket order market taker
     * @param side MarketOrder side
     * @param ccy Loan deal main currency
     * @param term Loan deal term
     * @param notional Notional amount of funds to lend/borrow
     * @param rate Loan deal annual interest rate
     *
     * @notice Callable only by LendingMarket after matching orders
     */
    function register(
        address maker,
        address taker,
        uint8 side,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate
    ) public override lendingMarketExists(ccy, term) returns (bytes32 loanId) {
        require(maker != taker, "Same person deal is not allowed");
        address lender;
        address borrower;

        if (Side(side) == Side.LEND) {
            lender = maker;
            borrower = taker;
        } else if (Side(side) == Side.BORROW) {
            lender = taker;
            borrower = maker;
        }

        collateralAggregator().releaseUnsettledCollateral(
            lender,
            ccy,
            notional.mul(MKTMAKELEVEL).div(PCT)
        );
        collateralAggregator().useCollateral(
            lender,
            borrower,
            ccy,
            notional.mul(MKTMAKELEVEL).div(PCT),
            notional,
            false
        );

        LoanDeal memory deal;
        deal.lender = lender;
        deal.borrower = borrower;
        deal.ccy = ccy;
        deal.term = term;
        deal.notional = notional;
        deal.rate = rate;
        deal.start = block.timestamp;
        deal.end = block.timestamp.add(deal.term.mul(86400));

        loanId = _generateDealId();
        loans[loanId] = deal;

        _registerPaymentSchedule(loanId, deal);
        // liquidations.addDealToLiquidationQueue(lender, borrower, loanId);

        emit Register(lender, borrower, ccy, term, notional, rate, loanId);
    }

    /**
     * @dev Triggers to get settlement status of loan deal.
     * @param loanId Loan deal ID
     */
    function getDealSettlementStatus(bytes32 loanId)
        public
        view
        override
        returns (bool)
    {
        return isSettled[loanId];
    }

    /**
     * @dev Triggers to get main currency the deal by `dealId`.
     * @param loanId Loan deal ID
     */
    function getDealCurrency(bytes32 loanId)
        public
        view
        override
        returns (bytes32)
    {
        return loans[loanId].ccy;
    }

    /**
     * @dev Triggers to get current information about Loan deal.
     * @param loanId Loan deal ID
     */
    function getLoanDeal(bytes32 loanId) public view returns (LoanDeal memory) {
        return loans[loanId];
    }

    /**
     * @dev Triggers to get termination state for loan with `loanId`.
     * @param loanId Loan deal ID
     */
    function getTerminationState(bytes32 loanId)
        public
        view
        returns (Termination memory)
    {
        return terminations[loanId];
    }

    /**
     * @dev Returns the payment schedule for a deal by `loanId`
     * @param loanId Loan deal ID
     */
    function getPaymentSchedule(bytes32 loanId)
        public
        view
        override
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        )
    {
        LoanDeal memory deal = loans[loanId];

        return _constructSchedule(deal, true);
    }

    /**
     * @dev Returns the timestamp of the last settled payment in payment schedule
     * @param loanId Loan deal ID
     */
    function getLastSettledPayment(bytes32 loanId)
        external
        view
        returns (uint256 settlementTime)
    {
        LoanDeal memory deal = loans[loanId];

        uint256 payNums = termStructure().getNumPayments(
            deal.term,
            paymentFrequency
        );
        uint256[] memory daysArr = termStructure().getTermSchedule(
            deal.term,
            paymentFrequency
        );

        for (uint256 i = payNums; i > 0; i--) {
            uint256 time = _timeShift(deal.start, daysArr[i - 1]);
            bool status = paymentAggregator().isSettled(
                deal.lender,
                deal.borrower,
                deal.ccy,
                time
            );

            if (status) {
                settlementTime = time;
            }
        }
    }

    /**
     * @dev Triggers to get stored present value of loan deal.
     * @param loanId Loan ID to update PV for
     */
    function getDealLastPV(
        address party0,
        address party1,
        bytes32 loanId
    ) public view override returns (uint256, uint256) {
        LoanDeal memory deal = loans[loanId];

        if (deal.pv == 0) {
            deal.pv = getDealPV(loanId);
        }

        if (party0 == deal.lender && party1 == deal.borrower) {
            return (0, deal.pv);
        } else if (party0 == deal.borrower && party1 == deal.lender) {
            return (deal.pv, 0);
        }

        return (0, 0);
    }

    // =========== EARLY TERMINATION SECTION ===========

    /**
     * @dev Triggers to request early termination of the loan.
     * @param loanId Loan deal ID
     *
     * @notice Executed only for working loan deal
     */
    function requestTermination(bytes32 loanId) public override {
        Termination storage termination = terminations[loanId];
        LoanDeal memory deal = loans[loanId];
        require(
            msg.sender == deal.lender || msg.sender == deal.borrower,
            "parties must request"
        );
        require(updateLoanPV(loanId), "failed MtM");

        termination.terminationAsker = msg.sender;

        emit RequestTermination(loanId, msg.sender);
    }

    /**
     * @dev Triggers to accept early termination of the loan.
     * @param loanId Loan deal ID
     *
     * @notice Executed only for working loan deal
     */
    function acceptTermination(bytes32 loanId) public override {
        Termination storage termination = terminations[loanId];
        require(
            termination.terminationAsker != address(0),
            "no termination request"
        );

        LoanDeal memory deal = loans[loanId];

        if (termination.terminationAsker == deal.lender) {
            require(msg.sender == deal.borrower, "borrower must accept");
        } else {
            require(msg.sender == deal.lender, "lender must accept");
        }

        require(updateLoanPV(loanId), "failed MtM");

        if (isSettled[loanId]) {
            (
                uint256[] memory payments,
                ,
                bool[] memory settlements
            ) = _constructSchedule(deal, true);

            uint256 i;
            for (i = 0; i < settlements.length; i++) {
                if (settlements[i] == false) break;
            }

            uint256 deltaDays;

            if (i == 0) {
                deltaDays = BokkyPooBahsDateTimeLibrary.diffDays(
                    deal.start,
                    block.timestamp
                );
            } else {
                deltaDays = BokkyPooBahsDateTimeLibrary.diffDays(
                    payments[i - 1],
                    block.timestamp
                );
            }

            uint256 interestRatePerDay = deal.rate.mul(1e18).div(36500);
            uint256 accuredInterestRate = interestRatePerDay.mul(deltaDays);
            uint256 accuredInterest = deal
                .notional
                .mul(accuredInterestRate)
                .div(1e20);
            uint256 totalPayment = accuredInterest.add(deal.pv);
            collateralAggregator().liquidate(
                deal.borrower,
                deal.lender,
                deal.ccy,
                totalPayment,
                deal.pv,
                true
            );

            emit EarlyTermination(loanId, msg.sender, totalPayment);
        } else {
            emit EarlyTermination(loanId, msg.sender, 0);
        }

        _liquidateLoan(loanId);
    }

    /**
     * @dev Triggers to reject early termination of the loan.
     * @param loanId Loan deal ID
     *
     * @notice Executed only for working loan deal
     */
    function rejectTermination(bytes32 loanId) public override {
        Termination memory termination = terminations[loanId];
        require(
            termination.terminationAsker != address(0),
            "no termination request"
        );

        LoanDeal memory deal = loans[loanId];
        require(
            msg.sender == deal.lender || msg.sender == deal.borrower,
            "parties must reject"
        );
        require(updateLoanPV(loanId), "failed MtM");

        delete terminations[loanId];

        emit RejectTermination(loanId, msg.sender);
    }

    /**
     * @dev Triggers to transfer loan ownership.
     * @param loanId Loan deal ID
     * @param newOwner Address of new owner (lender)
     *
     * @notice Executed only by original lender
     */
    function novation(bytes32 loanId, address newOwner)
        public
        override
        workingLoan(loanId)
    {
        LoanDeal storage deal = loans[loanId];
        require(isTransferable, "transfers not allowed");

        address prevLender = deal.lender;
        require(msg.sender == prevLender, "lender must trasfer");

        _removePaymentSchedule(loanId, deal);
        collateralAggregator().releaseCollateral(
            prevLender,
            deal.borrower,
            deal.ccy,
            0,
            deal.pv,
            true
        );

        deal.lender = newOwner;

        _registerPaymentSchedule(loanId, deal);
        collateralAggregator().useCollateral(
            newOwner,
            deal.borrower,
            deal.ccy,
            0,
            deal.pv,
            true
        );

        emit Novation(loanId, newOwner);
    }

    function liquidate(bytes32 loanId) external override {
        _liquidateLoan(loanId);
    }

    // =========== MARK-TO-MARKET SECTION ===========

    /**
     * @dev Main function for mark-to-market: updates present value,
     * loan state and liquidates loan deal if collateral coverage <125%
     * for every liquidation msg.sender get rewarded ~5% of loan deal PV.
     * @param loanId Loan ID to update PV for
     */
    function markToMarket(bytes32 loanId) external override returns (bool) {
        _verifyNotionalExchange(loanId);
        require(updateLoanPV(loanId), "failed update PV");

        return true;
    }

    /**
     * @dev Triggers to update present value of loan.
     * @param loanId Loan ID to update PV for
     *
     * @notice Calculates discount factors based on lending markets rates,
     * and updates the state of the loan. Can be triggered to liquidate loan deal
     * if borrower's collateral not enough.
     */
    function updateLoanPV(bytes32 loanId) internal returns (bool) {
        uint256 pv = getDealPV(loanId);

        if (pv != 0) {
            LoanDeal storage deal = loans[loanId];
            if (!isSettled[loanId]) return true;

            uint256 oldPV = deal.pv == 0 ? deal.notional : deal.pv;
            deal.pv = pv;

            collateralAggregator().updatePV(
                deal.lender,
                deal.borrower,
                deal.ccy,
                0,
                oldPV,
                0,
                deal.pv
            );

            emit MarkToMarket(loanId, oldPV, pv);
        }

        return true;
    }

    /**
     * @dev Triggers to recalculate present value of loan deal.
     * @param loanId Loan ID to update PV for
     */
    function getDealPV(bytes32 loanId)
        public
        view
        override
        returns (uint256 pv)
    {
        LoanDeal memory deal = loans[loanId];
        if (!isSettled[loanId]) return deal.notional;

        (
            uint256[] memory dfs,
            uint256[] memory terms
        ) = lendingMarketController().getDiscountFactorsForCcy(deal.ccy);

        (
            uint256[] memory payments,
            uint256[] memory amounts,

        ) = _constructSchedule(deal, false);

        for (uint256 i = 0; i < payments.length; i++) {
            if (payments[i] < block.timestamp) continue;
            uint256 d = DiscountFactor.interpolateDF(dfs, terms, payments[i]);

            pv = pv.add((amounts[i].mul(d)));
        }

        return pv.div(BP);
    }

    /**
     * @dev Internal function to liquidate loan deal and remove all payments in timeslots
     * @param loanId Loan deal ID
     */
    function _liquidateLoan(bytes32 loanId) internal {
        LoanDeal memory deal = loans[loanId];
        _removePaymentSchedule(loanId, deal);

        emit Liquidate(loanId);
        delete loans[loanId];
    }

    /**
     * @dev Internal function to get TimeSlot position after adding days
     * @param timestamp Timestamp to add days
     * @param numDays number of days to add
     * @return Updated timestamp and TimeSlot position
     */
    function _timeShift(uint256 timestamp, uint256 numDays)
        internal
        pure
        returns (uint256)
    {
        timestamp = BokkyPooBahsDateTimeLibrary.addDays(timestamp, numDays);

        return timestamp;
    }

    /**
     * @dev Internal function for registering payment schedule while registering new loan
     * @param loanId Loan deal ID
     * @param deal LoanDeal structure
     */
    function _registerPaymentSchedule(bytes32 loanId, LoanDeal memory deal)
        internal
    {
        (
            uint256[] memory payments,
            uint256[] memory amounts,

        ) = _constructSchedule(deal, false);

        uint256[] memory lenderLeg = new uint256[](payments.length);
        lenderLeg[0] = deal.notional;

        paymentAggregator().registerPayments(
            deal.lender,
            deal.borrower,
            deal.ccy,
            loanId,
            payments,
            lenderLeg,
            amounts
        );
    }

    /**
     * @dev Internal function for registering payment schedule while registering new loan
     * @param loanId Loan deal ID
     * @param deal LoanDeal structure
     */
    function _removePaymentSchedule(bytes32 loanId, LoanDeal memory deal)
        internal
    {
        (
            uint256[] memory payments,
            uint256[] memory amounts,

        ) = _constructSchedule(deal, false);

        uint256[] memory lenderLeg = new uint256[](payments.length);
        if (!isSettled[loanId]) {
            lenderLeg[0] = deal.notional;
        }

        paymentAggregator().removePayments(
            deal.lender,
            deal.borrower,
            deal.ccy,
            loanId,
            payments,
            lenderLeg,
            amounts
        );
    }

    struct ScheduleConstructionLocalVars {
        uint256 payNums;
        uint256[] daysArr;
        uint256 dfFrac;
        uint256 coupon;
        uint256 time;
        bool status;
    }

    /**
     * @dev Internal function to construct payment schedule using deal parameters
     * @param deal Loan deal structure
     * @param settlementStatus Boolean wether settlement status should be returned
     * @return Payment schedule structure
     */
    function _constructSchedule(LoanDeal memory deal, bool settlementStatus)
        internal
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        )
    {
        ScheduleConstructionLocalVars memory vars;

        vars.payNums = termStructure().getNumPayments(
            deal.term,
            paymentFrequency
        );
        vars.daysArr = termStructure().getTermSchedule(
            deal.term,
            paymentFrequency
        );
        vars.dfFrac = termStructure().getDfFrac(deal.term);

        vars.coupon = (deal.notional.mul(deal.rate).mul(vars.dfFrac))
            .div(BP)
            .div(BP);

        uint256 len = vars.payNums.add(1);
        uint256[] memory payments = new uint256[](len);
        uint256[] memory amounts = new uint256[](len);
        bool[] memory settlements = new bool[](len);

        for (uint256 i = 1; i <= vars.payNums; i++) {
            uint256 time = _timeShift(deal.start, vars.daysArr[i - 1]);

            payments[i] = time;
            if (i == vars.payNums) {
                amounts[i] = deal.notional.add(vars.coupon);
            } else {
                amounts[i] = vars.coupon;
            }

            if (settlementStatus) {
                vars.status = paymentAggregator().isSettled(
                    deal.lender,
                    deal.borrower,
                    deal.ccy,
                    vars.time
                );
                settlements[i] = vars.status;
            }
        }

        uint256 settlement = _timeShift(deal.start, 2);
        payments[0] = settlement;

        return (payments, amounts, settlements);
    }

    /**
     * @dev Internal function to verify the settlement of notional exchange
     * @param loanId Loan deal id
     */
    function _verifyNotionalExchange(bytes32 loanId) internal {
        if (!isSettled[loanId]) {
            LoanDeal memory deal = loans[loanId];
            uint256 time = _timeShift(deal.start, 2);
            bool status = paymentAggregator().isSettled(
                deal.lender,
                deal.borrower,
                deal.ccy,
                time
            );

            if (status) {
                isSettled[loanId] = true;
                collateralAggregator().releaseCollateral(
                    deal.lender,
                    deal.borrower,
                    deal.ccy,
                    deal.notional.mul(MKTMAKELEVEL).div(PCT),
                    0,
                    false
                );
                collateralAggregator().settleCollateral(
                    deal.lender,
                    deal.borrower,
                    deal.ccy,
                    0,
                    deal.notional
                );
            }
        }
    }

    /**
     * @dev Triggers to return loan product implementation version
     * @return implementation version
     */
    function getVersion() public view override returns (uint16) {
        return VERSION;
    }
}
