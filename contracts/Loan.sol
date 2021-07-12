// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import './interfaces/ICollateral.sol';
import "./ProtocolTypes.sol";
import './interfaces/ILendingMarketController.sol';
import './interfaces/IDiscountFactors.sol';
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title Loan contract is used to store Lending deals in Secured Finance  
 * protocol. This contract handle the PV updates on lending market rate changes
 * also allowing parties to mutually terminate their lending deals
 *
 * Contract linked to Lending Market contracts, LendingMarketController and Collateral contract.
 */
contract Loan is ProtocolTypes, IDiscountFactors {
    using SafeMath for uint256;
    
    event MakeLoanDeal(address indexed lender, address indexed borrower, Ccy ccy, Term term, uint256 amt, uint256 rate, uint256 indexed loanId);
    event NotifyPayment(uint256 loanId, uint256 amt, bytes32 txHash);
    event ConfirmPayment(uint256 loanId, uint256 amt, bytes32 txHash);
    event RequestTermination(uint256 loanId, address indexed requestedBy);
    event EarlyTermination(uint256 loanId, address indexed acceptedBy, uint256 payment);
    event RejectTermination(uint256 loanId, address indexed rejectedBy);
    event UpdateState(uint256 loanId, LoanState prevState, LoanState currState);
    event MarkToMarket(uint256 loanId, uint256 prevPV, uint256 currPV);
    event TransferLoanOwnership(uint256 loanId, address indexed newLender);

    uint256 constant NOTICE = 2 weeks;
    uint256 constant SETTLE = 2 days;
    uint256 constant MAXPAYNUM = 5;

    /** @dev
        DAYCOUNTS CONVENTION TABLE for PAYMENTS and NOTICES
     */
    // for end date
    uint256[NUMTERM] DAYS = [
        90 days,
        180 days,
        365 days,
        730 days,
        1095 days,
        1825 days
    ];
    // day count fractions for coupon calc (basis point based)
    uint256[NUMTERM] DCFRAC = [
        2500,
        5000,
        BP,
        BP,
        BP,
        BP
    ];
    // for payments and notices
    uint256[MAXPAYNUM] sched_3m = [90 days];
    uint256[MAXPAYNUM] sched_6m = [180 days];
    uint256[MAXPAYNUM] sched_1y = [365 days];
    uint256[MAXPAYNUM] sched_2y = [365 days, 730 days];
    uint256[MAXPAYNUM] sched_3y = [365 days, 730 days, 1095 days];
    uint256[MAXPAYNUM] sched_5y = [
        365 days,
        730 days,
        1095 days,
        1460 days,
        1825 days
    ];
    uint256[][NUMTERM] SCHEDULES = [
        sched_3m,
        sched_6m,
        sched_1y,
        sched_2y,
        sched_3y,
        sched_5y
    ];
    // for generate payments and notices schedules
    uint256[NUMTERM] PAYNUMS = [
        1,
        1,
        1,
        2,
        3,
        5
    ];

    // seconds in DFTERM
    uint256[NUMDF] SECONDS = [
        86400 * 90,
        86400 * 180,
        86400 * 365,
        86400 * 365 * 2,
        86400 * 365 * 3,
        86400 * 365 * 4,
        86400 * 365 * 5
    ];

    struct LoanDeal {
        address lender;
        address borrower;
        Ccy ccy;
        Term term;
        uint256 amt;
        uint256 rate;
        uint256 start;
        uint256 end;
        uint256 pv; // valuation in ccy
        uint256 asOf; // updated date
        bool isAvailable;
        bool terminationAsked;
        address terminationAsker;
        bytes32 startTxHash;
        LoanState state;
    }

    struct Schedule {
        uint256 payNums;
        uint256[MAXPAYNUM] notices;
        uint256[MAXPAYNUM] payments;
        uint256[MAXPAYNUM] amounts;
        bool[MAXPAYNUM] isDone;
        bytes32[MAXPAYNUM] txHash;
    }

    /**
    * @dev Mapping for all storing LoanDeals and Schedules per loanIDs.
    */
    mapping(uint256 => LoanDeal) private loans;
    mapping(uint256 => Schedule) private schedules;
    // address[] private lenders;
    address public owner;
    bool public isTransferable;
    uint256 public last_loan_id;

    // Contracts
    ICollateral collateral;
    ILendingMarketController lendingController;
    mapping(Ccy => mapping(Term => address)) public lendingMarkets;

    /**
    * @dev Modifier to make a function callable only by contract owner.
    */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
    * @dev Modifier to check if LendingMarket contract linked with this contract
    * @param _ccy LendingMarket currency
    * @param _term LendingMarket term
    */
    modifier lendingMarketExists(Ccy _ccy, Term _term) {
        require(lendingMarkets[_ccy][_term] == msg.sender);
        _;
    }

    /**
    * @dev Modifier to make a function callable only when the loan deal is active.
    * @param loanId Loan deal ID
    */
    modifier activeLoan(uint256 loanId) {
        require(isActiveLoan(loanId), "loan is not active");
        _;
    }

    /**
    * @dev Modifier to make a function callable only when the loan deal is active.
    * @param loanId Loan deal ID
    */
    modifier workingLoan(uint256 loanId) {
        require(loans[loanId].state == LoanState.WORKING, "loan is not working");
        _;
    }

    /**
    * @dev Contract constructor function.
    *
    * @notice sets contract deployer as owner of this contract
    */
    constructor() public {
        owner = msg.sender;
    }

    /**
    * @dev Triggers to link with LendingMarketController contract.
    * @param addr LendingMarketController contract address 
    *
    * @notice Executed only by contract owner
    */
    function setLendingControllerAddr(address addr) public onlyOwner {
        lendingController = ILendingMarketController(addr);
    }

    /**
    * @dev Triggers to link with Collateral contract.
    * @param addr Collateral contract address 
    *
    * @notice Executed only by contract owner
    */
    function setCollateralAddr(address addr) public onlyOwner {
        collateral = ICollateral(addr);
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
    function addLendingMarket(Ccy _ccy, Term _term, address addr) public onlyOwner {
        require(lendingMarkets[_ccy][_term] == address(0), "Couldn't rewrite existing market");
        lendingMarkets[_ccy][_term] = addr;
    }

    /**
    * @dev Internally triggered to increase and return id of the last loan.
    */
    function _next_id() internal returns (uint256) {
        last_loan_id++; 
        return last_loan_id;
    }

    /**
    * @dev Triggers to check if Loan is active. Also used in modifier.
    * If loan is not active, market order deleted from order book.
    * @param loanId Loan deal ID
    */
    function isActiveLoan(uint256 loanId) public view returns (bool) {
        return loans[loanId].isAvailable;
    }

    /**
    * @dev Triggered to register new loan deal, also locks borrowers collateral.
    * @param maker LendingMarket order market maker
    * @param taker LendingMarket order market taker
    * @param side MarketOrder side
    * @param ccy Loan deal main currency
    * @param term Loan deal term
    * @param amt Amount of funds to lend/borrow
    * @param rate Loan deal annual interest rate
    *
    * @notice Callable only by LendingMarket after matching orders
    */
    function makeLoanDeal(
        address maker,
        address taker,
        Side side,
        Ccy ccy,
        Term term,
        uint256 amt,
        uint256 rate
    ) public lendingMarketExists(ccy, term) {
        require(maker != taker, 'Same person deal is not allowed');
        address lender;
        address borrower;
        if (side == Side.LEND) {
            lender = maker;
            borrower = taker;
        } else if (side == Side.BORROW) {
            lender = taker;
            borrower = maker;
        }

        collateral.useCollateral(uint8(ccy), amt, borrower);

        LoanDeal memory item;
        item.lender = lender;
        item.borrower = borrower;
        item.ccy = ccy;
        item.term = term;
        item.amt = amt;
        item.rate = rate;
        item.start = block.timestamp;
        item.end = block.timestamp.add(DAYS[uint256(term)]);
        item.pv = amt;
        item.asOf = block.timestamp;
        item.isAvailable = true;
        item.state = LoanState.REGISTERED;

        uint256 loanId = _next_id();
        loans[loanId] = item;
        fillSchedule(term, amt, rate, loanId);

        emit MakeLoanDeal(lender, borrower, ccy, term, amt, rate, loanId);
    }

    /**
    * @dev Triggered to construct payment schedule for new loan deal.
    * @param term Loan deal term
    * @param amt Amount of funds to lend/borrow
    * @param rate Loan deal annual interest rate
    */
    function fillSchedule(
        Term term,
        uint256 amt,
        uint256 rate,
        uint256 loanId
    ) internal {
        Schedule memory schedule;
        uint256 payNums = PAYNUMS[uint256(term)];
        uint256[] memory daysArr = SCHEDULES[uint256(term)];
        for (uint256 i = 0; i < payNums; i++) {
            schedule.notices[i] = daysArr[i].add(block.timestamp).sub(NOTICE);
            schedule.payments[i] = daysArr[i].add(block.timestamp);
            schedule.amounts[i] = (amt.mul(rate).mul(DCFRAC[uint256(term)])).div(BP).div(BP);
        }
        schedule.payNums = payNums;
        schedule.amounts[payNums - 1] += amt; // redemption amt

        schedules[loanId] = schedule;
    }

    /**
    * @dev Triggers to get current LoanState of loan deal.
    * @param loanId Loan deal ID
    */
    function getLoanState(uint256 loanId) public view returns (uint8) {
        return uint8(loans[loanId].state);
    }

    /**
    * @dev Triggers to get current information about Loan deal.
    * @param loanId Loan deal ID
    */
    function getLoanItem(uint256 loanId) public view returns (LoanDeal memory) {
        return loans[loanId];
    }

    /**
    * @dev Triggers to get current loan schedule.
    * @param loanId Loan deal ID
    */
    function getSchedule(uint256 loanId) public view returns (Schedule memory) {
        return schedules[loanId];
    }

    // =========== LOAN STATE MANAGEMENT SECTION ===========

    /**
    * @dev Triggers to get current state for loan deal based on payment schedule.
    * @param loanId Loan ID to get payment schedule for
    */
    function getCurrentState(uint256 loanId) public view returns (LoanState) {
        if (loans[loanId].state == LoanState.REGISTERED) return LoanState.REGISTERED;

        Schedule memory schedule = schedules[loanId];
        uint256 i;
        for (i = 0; i < schedule.payNums; i++) {
            if (schedule.isDone[i] == false) break;
        }
        if (i == schedule.payNums || schedule.notices[i] == 0) return LoanState.CLOSED;
        if (block.timestamp < schedule.notices[i]) return LoanState.WORKING;
        if (block.timestamp <= schedule.payments[i]) return LoanState.DUE;
        if (block.timestamp > schedule.payments[i]) return LoanState.PAST_DUE;
    }

    /**
    * @dev Triggers to update loan deal state based on payment schedule.
    * @param loanId Loan ID to update state for
    *
    * @notice Executed internally by every update in present value
    */
    function updateState(uint256 loanId) internal {
        LoanDeal storage item = loans[loanId];
        LoanState prevState = item.state;

        if (item.state == LoanState.REGISTERED) {
            if (item.startTxHash == bytes32(0) && item.start.add(SETTLE) < block.timestamp) {
                item.state = LoanState.CLOSED;
                item.isAvailable = false;
                collateral.liquidate(item.lender, item.borrower, item.amt.mul(MKTMAKELEVEL).div(PCT), uint8(item.ccy));
                collateral.releaseCollateral(uint8(item.ccy), item.amt, item.borrower);
            }
        } else {
            item.state = getCurrentState(loanId);
            CollateralState colState = CollateralState(collateral.getColState(item.borrower));
            if (colState == CollateralState.LIQUIDATION) {
                item.state = LoanState.TERMINATED;
                item.isAvailable = false;
                collateral.liquidate(item.borrower, item.lender, item.pv.mul(collateral.LQLEVEL()).div(PCT), uint8(item.ccy));
                collateral.releaseCollateral(uint8(item.ccy), item.pv, item.borrower);
            }

            if (item.state == LoanState.PAST_DUE) {
                Schedule storage schedule = schedules[loanId];
                uint256 i;
                for (i = 0; i < schedule.payNums; i++) {
                    if (schedule.isDone[i] == false) break;
                }
                schedule.isDone[i] = true;
                uint256 amount = schedule.amounts[i];
                collateral.liquidate(item.borrower, item.lender, amount.mul(collateral.LQLEVEL()).div(PCT), uint8(item.ccy));

                // terminate loan on last last payment
                if (i == schedule.payNums.sub(1)) {
                    item.state = LoanState.TERMINATED;
                    item.isAvailable = false;
                    collateral.releaseCollateral(uint8(item.ccy), item.pv, item.borrower);
                }
            }
        } 
        if(item.state != prevState) {
            emit UpdateState(loanId, prevState, item.state);
        }
    }

    // =========== PAYMENT CONFIRMATION SECTION ===========

    /**
    * @dev Triggers to get notify counterparty about executed payment.
    * @param amt Amount of funds transfer by counterparty
    * @param loanId Loan deal ID
    * @param txHash Cross-chain tx hash to verify payment
    *
    * @notice Executed only for active loan deal
    */
    function notifyPayment(
        uint256 loanId,
        uint256 amt,
        bytes32 txHash
    ) public activeLoan(loanId) {
        LoanDeal storage item = loans[loanId];
        require(item.state == LoanState.REGISTERED || item.state == LoanState.DUE, 'No need to notify now');

        if (item.state == LoanState.REGISTERED) {
            require(msg.sender == item.lender, "lender must notify");
            require(amt == item.amt, "amount don't match");
            item.startTxHash = txHash;
        } else if (item.state == LoanState.DUE) {
            require(msg.sender == item.borrower, "borrower must notify");
            Schedule storage schedule = schedules[loanId];
            uint256 i;
            for (i = 0; i < schedule.payNums; i++) {
                if (schedule.isDone[i] == false) break;
            }
            require(amt == schedule.amounts[i], "amount don't match");
            schedule.txHash[i] = txHash;
        }

        emit NotifyPayment(loanId, amt, txHash);
    }

    /**
    * @dev Triggers to get confirm payment executed by loan deal counterparty.
    * @param amt Amount of funds transfer by counterparty
    * @param loanId Loan deal ID
    * @param txHash Cross-chain tx hash to verify payment
    *
    * @notice Executed only for active loan deal
    */
    function confirmPayment(
        uint256 loanId,
        uint256 amt,
        bytes32 txHash
    ) public activeLoan(loanId) {
        LoanDeal storage item = loans[loanId];
        require(item.state == LoanState.REGISTERED || item.state == LoanState.DUE, 'No need to confirm now');

        if (item.state == LoanState.REGISTERED) {
            require(msg.sender == item.borrower, "borrower must confirm");
            require(item.startTxHash == txHash, 'txhash not match');
            require(amt == item.amt, 'confirm amount not match');

            item.state = LoanState.WORKING;

            collateral.releaseCollateral(uint8(item.ccy), item.amt.mul(MKTMAKELEVEL).div(PCT), item.lender);
            collateral.updateState(item.borrower);
        } else if (item.state == LoanState.DUE) {
            require(msg.sender == item.lender, "lender must confirm");
            Schedule storage schedule = schedules[loanId];
            uint256 i;
            for (i = 0; i < schedule.payNums; i++) {
                if (schedule.isDone[i] == false) break;
            }

            require(amt == schedule.amounts[i], 'confirm amount not match');
            require(txHash == schedule.txHash[i], 'confirm txHash not match');
            schedule.isDone[i] = true;

            if (i == schedule.payNums.sub(1)) {
                item.state = LoanState.CLOSED;
                item.isAvailable = false;
                collateral.releaseCollateral(uint8(item.ccy), item.pv, item.borrower);
            } else {
                item.state = LoanState.WORKING;
            }
        }

        emit ConfirmPayment(loanId, amt, txHash);
    }

    // =========== EARLY TERMINATION SECTION ===========

    /**
    * @dev Triggers to request early termination of the loan.
    * @param loanId Loan deal ID
    *
    * @notice Executed only for working loan deal
    */
    function requestTermination(uint256 loanId) public workingLoan(loanId) {
        LoanDeal storage item = loans[loanId];
        require(msg.sender == item.lender || msg.sender == item.borrower, 'parties must request');
        require(updateLoanPV(loanId), "failed MtM");

        item.terminationAsked = true;
        item.terminationAsker = msg.sender;

        emit RequestTermination(loanId, msg.sender);
    }

    /**
    * @dev Triggers to accept early termination of the loan.
    * @param loanId Loan deal ID
    *
    * @notice Executed only for working loan deal
    */
    function acceptTermination(uint256 loanId) public workingLoan(loanId) {
        LoanDeal memory item = loans[loanId];
        require(item.terminationAsked, 'no termination request');
        if (item.terminationAsker == item.lender) {
            require(msg.sender == item.borrower, 'borrower must accept');
        } else {
            require(msg.sender == item.lender, 'lender must accept');
        }

        require(updateLoanPV(loanId), "failed MtM");
        Schedule memory schedule = schedules[loanId];

        uint256 i;
        for (i = 0; i < schedule.payNums; i++) {
            if (schedule.isDone[i] == false) break;
        }

        uint256 timeDelta;
        if (i == 0) {
            timeDelta = block.timestamp.sub(item.start);
        } else {
            timeDelta = block.timestamp.sub(schedule.payments[i - 1]);
        }

        uint256 interestPerSecond = item.rate.mul(1e18).div(SECONDS[2]);

        uint256 accuredInterest = interestPerSecond.mul(timeDelta).div(1e18);
        uint totalPayment = accuredInterest.add(item.pv);
        collateral.liquidate(item.borrower, item.lender, totalPayment, uint8(item.ccy));
        collateral.releaseCollateral(uint8(item.ccy), item.pv, item.borrower);

        loans[loanId].state = LoanState.TERMINATED;
        loans[loanId].isAvailable = false;

        emit EarlyTermination(loanId, msg.sender, totalPayment);
    }

    /**
    * @dev Triggers to reject early termination of the loan.
    * @param loanId Loan deal ID
    *
    * @notice Executed only for working loan deal
    */
    function rejectTermination(uint256 loanId) public workingLoan(loanId) {
        LoanDeal memory item = loans[loanId];
        require(item.terminationAsked, 'no termination request');
        require(msg.sender == item.lender || msg.sender == item.borrower, 'parties must request');
        require(updateLoanPV(loanId), "failed MtM");

        item.terminationAsked = false;
        item.terminationAsker = address(0);

        emit RejectTermination(loanId, msg.sender);
    }

    /**
    * @dev Triggers to transfer loan ownership.
    * @param loanId Loan deal ID
    * @param newOwner Address of new owner (lender)
    *
    * @notice Executed only by original lender
    */
    function transferLoanOwnership(
        uint256 loanId,
        address newOwner
    ) public workingLoan(loanId) {
        LoanDeal memory item = loans[loanId];
        require(isTransferable, "transfers not allowed");
        require(msg.sender == item.lender, "lender must trasfer");
        loans[loanId].lender = newOwner;
        require(updateLoanPV(loanId), "failed MtM");

        // handle updating pv with new owners

        emit TransferLoanOwnership(loanId, newOwner);
    }

    // =========== MARK-TO-MARKET SECTION ===========

    /**
    * @dev Main function for mark-to-market: updates present value, 
    * loan state and liquidates loan deal if collateral coverage <125%
    * for every liquidation msg.sender get rewarded ~5% of loan deal PV.
    * @param loanId Loan ID to update PV for
    */
    function markToMarket(uint256 loanId) public activeLoan(loanId) returns (bool) {
        require(updateLoanPV(loanId), "failed update PV");
        updateState(loanId);

        return true;
    }

    /**
    * @dev Triggers to adjust discount factors by interpolating to current loan maturity
    * @param dfArr Array of discount factors for loan currency from lending markets
    * @param date Date to calculate discount factors for 
    *
    * @notice Executed internally
    */
    function interpolateDF(uint256[NUMDF] memory dfArr, uint256 date)
        internal
        view
        returns (uint256)
    {
        uint256 time = date.sub(block.timestamp);

        if (time <= SECONDS[0]) {
            uint256 left = SECONDS[0].sub(time);

            return (BP.mul(left).add(dfArr[0].mul(time))).div(SECONDS[0]);
        } else {
            for (uint256 i = 1; i < NUMDF; i++) {
                if (SECONDS[i - 1] < time && time <= SECONDS[i]) {
                    uint256 left = time.sub(SECONDS[i - 1]);
                    uint256 right = SECONDS[i].sub(time);
                    uint256 total = SECONDS[i].sub(SECONDS[i - 1]);
                    return ((dfArr[i - 1].mul(right)).add((dfArr[i].mul(left))).div(total));
                }
            }
        }
    }

    /**
    * @dev Triggers to update present value of loan.
    * @param loanId Loan ID to update PV for
    *
    * @notice Calculates discount factors based on lending markets rates, 
    * and updates the state of the loan. Can be triggered to liquidate loan deal
    * if borrower's collateral not enough.
    */
    function updateLoanPV(uint256 loanId) internal returns (bool) {
        LoanDeal storage item = loans[loanId];
        if (item.state == LoanState.REGISTERED) return true;

        DiscountFactor memory df = lendingController.getDiscountFactorsForCcy(uint8(item.ccy));
        uint256[NUMDF] memory dfArr = [
            df.df3m,
            df.df6m,
            df.df1y,
            df.df2y,
            df.df3y,
            df.df4y,
            df.df5y
        ];
        uint256 pv;
        Schedule memory schedule = schedules[loanId];

        for (uint256 i = 0; i < schedule.payNums; i++) {
            if (schedule.payments[i] < block.timestamp) continue;
            uint256 d = interpolateDF(dfArr, schedule.payments[i]);
            pv = pv.add((schedule.amounts[i].mul(d)));
        }

        if (pv != 0) {
            uint256 oldPV = item.pv;
            item.pv = pv.div(BP);
            item.asOf = block.timestamp;

            collateral.updatePV(item.borrower, oldPV, item.pv, uint8(item.ccy));

            emit MarkToMarket(loanId, oldPV, pv.div(BP));
        }

        return true;
    }

    /**
    * @dev Triggers to get current present value of loan deal.
    * @param loanId Loan ID to update PV for
    */
    function getCurrentPV(uint256 loanId) public view returns (uint256 pv) {
        LoanDeal memory item = loans[loanId];
        Schedule memory schedule = schedules[loanId];

        DiscountFactor memory df = lendingController.getDiscountFactorsForCcy(uint8(item.ccy));
        uint256[NUMDF] memory dfArr = [
            df.df3m,
            df.df6m,
            df.df1y,
            df.df2y,
            df.df3y,
            df.df4y,
            df.df5y
        ];

        for (uint256 i = 0; i < schedule.payNums; i++) {
            if (schedule.payments[i] < now) continue;
            uint256 d = interpolateDF(dfArr, schedule.payments[i]);

            pv = pv.add((schedule.amounts[i].mul(d)));
        }

        return pv.div(BP);
    }

    /**
    * @dev Triggers to calculate discount factors for updating the present value of loan.
    * @param loanId Array of discount factors for loan currency from lending markets
    * @param date Date to calculate discount factors for 
    *
    * @notice Executed internally
    */
    function getDF(uint256 loanId, uint256 date)
        public
        view
        returns (uint256)
    {
        LoanDeal memory item = loans[loanId];
        DiscountFactor memory df = lendingController.getDiscountFactorsForCcy(uint8(item.ccy));
        uint256[NUMDF] memory dfArr = [
            df.df3m,
            df.df6m,
            df.df1y,
            df.df2y,
            df.df3y,
            df.df4y,
            df.df5y
        ];

        if (date <= now) return 0;
        uint256 time = date.sub(block.timestamp);

        if (time <= SECONDS[0]) {
            uint256 left = SECONDS[0].sub(time);
            return (BP.mul(left).add(dfArr[0].mul(time))).div(SECONDS[0]);
            // return dfArr[0].mul(time).div(SECONDS[0]);
        } else {
            for (uint256 i = 1; i < NUMDF; i++) {
                if (SECONDS[i - 1] < time && time <= SECONDS[i]) {
                    uint256 left = time.sub(SECONDS[i - 1]);
                    uint256 right = SECONDS[i].sub(time);
                    uint256 total = SECONDS[i].sub(SECONDS[i - 1]);

                    uint256 result = ((dfArr[i - 1].mul(right)).add((dfArr[i].mul(left))).div(total));

                    return result;
                }
            }
        }
    }
}
