// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import './MoneyMarket.sol';
import './FXMarket.sol';
import './Collateral.sol';

contract Loan {
    // (Execution)
    // 1. Deploy from market taker (maker addr, side, ccy, term, amt)
    // 2. Check collateral coverage and state
    // 3. If loan size is ok, delete one item from MoneyMarket
    // 4. loan state REGISTERED (prev: DEPLOYED)
    // 5. Emit message MakeLoanDeal or revert (prev: UpSize)
    // 6. TODO - Input FIL txHash and emit FIL FundArrived
    // 7. Taker manually check Filecoin network
    // 8. Taker confirmLoanAmount and make loan state WORKING and emit LoanBegin
    // 9. Change collateral state to IN_USE and emit message CollateralInUse

    // (Liquidation)
    // 10. Market Maker Input FIL txHash for Liquidation
    // 11. Emit message FILReturned
    // 12. Lender verify the FIL amount and make collateral state EMPTY(0) or NEW(>0)
    // 13. If no verification, other market maker will veiry and get fees
    // 14. Release 120% collateral to Market Maker
    // 15. Reserve 5% in Collateral contract and update loan state TERMINATED
    // 16. Emit message LoanTerminated

    // (Coupon Payments and Redemption)
    // 17. Payment notice to borrowers
    // 18. On failure, liquidate collateral to cover loss
    // 19. On redemption, change collateral state to AVAILABLE
    // 20. Change loan state to CLOSED and emit message LoanClosed

    // (Margin Call Operation)
    // 21. Get Market Mid Rates and FX Mid Rate
    // 22. Calc discount factors
    // 23. Calc present value of each loan
    // 24. Update Collateral Status
    // 25. Emit MARGIN_CALL or LIQUIDATION message

    event MakeLoanDeal(
        address makerAddr,
        MoneyMarket.Side side,
        MoneyMarket.Ccy ccy,
        MoneyMarket.Term term,
        uint256 amt,
        uint256 loanId
    );

    event NoitfyPayment(MoneyMarket.Ccy ccy, address sender, address receiver, uint256 indexed loanId, string txHash);

    event ConfirmPayment(
        address indexed loanMaker,
        address indexed colUser,
        MoneyMarket.Side side,
        MoneyMarket.Ccy ccy,
        uint256 term,
        uint256 amt,
        uint256 loanId
    );

    enum State {REGISTERED, WORKING, DUE, PAST_DUE, CLOSED, TERMINATED}
    enum DFTERM {_3m, _6m, _1y, _2y, _3y, _4y, _5y}

    uint256 constant BP = 10000; // basis point
    uint256 constant PCT = 100;
    uint256 constant FXMULT = 1000; // convert FILETH = 0.085 to 85
    uint256 constant PAYFREQ = 1; // annualy
    uint256 constant NOTICE = 2 weeks;
    uint256 constant NUMCCY = 3;
    uint256 constant NUMTERM = 6;
    uint256 constant NUMDF = 7; // numbef of discount factors
    uint256 constant MAXYEAR = 5; // years
    uint256 constant MAXPAYNUM = PAYFREQ * MAXYEAR;

    /** @dev
        DAYCOUNTS CONVENTION TABLE for PAYMENTS and NOTICES
     */
    // for end date
    uint256[NUMTERM] DAYS = [
        90 days,
        180 days,
        365 days,
        365 days * 2,
        365 days * 3,
        365 days * 5
    ];
    // day count fractions for coupon calc (basis point based)
    uint256[NUMTERM] DCFRAC = [
        (BP * 90) / 360,
        (BP * 180) / 360,
        BP * 1,
        BP * 1,
        BP * 1,
        BP * 1
    ];
    // for payments and notices
    uint256[MAXPAYNUM] sched_3m = [90 days];
    uint256[MAXPAYNUM] sched_6m = [180 days];
    uint256[MAXPAYNUM] sched_1y = [365 days];
    uint256[MAXPAYNUM] sched_2y = [365 days, 365 days * 2];
    uint256[MAXPAYNUM] sched_3y = [365 days, 365 days * 2, 365 days * 3];
    uint256[MAXPAYNUM] sched_5y = [
        365 days,
        365 days * 2,
        365 days * 3,
        365 days * 4,
        365 days * 5
    ];
    uint256[MAXPAYNUM][NUMTERM] SCHEDULES = [
        sched_3m,
        sched_6m,
        sched_1y,
        sched_2y,
        sched_3y,
        sched_5y
    ];
    // for generate payments and notices schedules
    uint256[NUMTERM] PAYNUMS = [1, 1, 1, 2, 3, 5];

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

    struct LoanBook {
        LoanItem[] loans;
        uint256 loanNum;
        bool isValue;
    }

    struct LoanItem {
        uint256 loanId;
        address lender; // ETH
        address borrower; // ETH
        MoneyMarket.Side side;
        MoneyMarket.Ccy ccy;
        MoneyMarket.Term term;
        uint256 amt;
        uint256 rate;
        Schedule schedule;
        uint256 pv; // valuation in ETH
        uint256 asOf; // updated date
        bool isAvailable;
        State state;
    }

    struct Schedule {
        uint256 start;
        uint256 end;
        uint256[MAXYEAR] notices;
        uint256[MAXYEAR] payments;
        uint256[MAXYEAR] amounts;
    }

    struct LoanInput {
        address makerAddr;
        MoneyMarket.Side side;
        MoneyMarket.Ccy ccy;
        MoneyMarket.Term term;
        uint256 amt;
    }

    // keeps all the records
    mapping(address => LoanBook) private loanMap;
    address[] private users;

    // Contracts
    MoneyMarket moneyMarket;
    FXMarket fxMarket;
    Collateral collateral;

    constructor(
        address moneyAddr,
        address fxAddr,
        address colAddr
    ) public {
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
        collateral = Collateral(colAddr);
    }

    /**@dev
        Create a loan deal
     */

    // to be called by market takers to register loan
    function makeLoanDeal(
        address makerAddr,
        MoneyMarket.Side side,
        MoneyMarket.Ccy ccy,
        MoneyMarket.Term term,
        uint256 amt
    ) public {
        require(makerAddr != msg.sender, 'Same person deal is not allowed');
        if (side == MoneyMarket.Side.LEND)
            collateral.useCollateral(ccy, amt, msg.sender);
        if (side == MoneyMarket.Side.BORROW) {
            collateral.useCollateral(ccy, amt, makerAddr);
        }
        uint256 rate = moneyMarket.takeOneItem(makerAddr, side, ccy, term, amt);
        LoanBook storage book = loanMap[makerAddr];
        LoanInput memory input = LoanInput(makerAddr, side, ccy, term, amt);
        LoanItem memory newItem = inputToItem(input, rate, book.loanNum++);
        book.loans.push(newItem);
        book.isValue = true;
        users.push(msg.sender);
        emit MakeLoanDeal(makerAddr, side, ccy, term, amt, newItem.loanId);
    }

    // helper to convert input data to LoanItem
    function inputToItem(
        LoanInput memory input,
        uint256 rate,
        uint256 loanId
    ) private view returns (LoanItem memory) {
        LoanItem memory item;
        item.loanId = loanId;
        item.lender = input.side == MoneyMarket.Side.LEND
            ? input.makerAddr
            : msg.sender;
        item.borrower = input.side == MoneyMarket.Side.BORROW
            ? input.makerAddr
            : msg.sender;
        item.side = input.side;
        item.ccy = input.ccy;
        item.term = input.term;
        item.amt = input.amt;
        item.rate = rate;
        item.schedule = getSchedule(input.term, input.amt, rate);
        item.pv = input.amt; // updated by MtM
        item.asOf = now;
        item.isAvailable = true;
        item.state = State.REGISTERED;
        return item;
    }

    // helper to generate payment schedule dates
    function getSchedule(
        MoneyMarket.Term term,
        uint256 amt,
        uint256 rate
    ) public view returns (Schedule memory) {
        uint256[MAXYEAR] memory notices = SCHEDULES[uint256(term)];
        uint256[MAXYEAR] memory payments = SCHEDULES[uint256(term)];
        uint256[MAXYEAR] memory amounts = SCHEDULES[uint256(term)];
        for (uint256 i = 0; i < PAYNUMS[uint256(term)]; i++) {
            notices[i] += now - NOTICE;
            payments[i] += now;
            amounts[i] = (amt * rate * DCFRAC[uint256(term)]) / BP / BP;
        }
        return
            Schedule(
                now,
                now + DAYS[uint256(term)],
                notices,
                payments,
                amounts
            );
    }

    // function getLoanState(uint256 loanId, address addr) public returns (uint256) {
    //     // require(loanMap[msg.sender].isValue, 'no loan item found');
    //     LoanBook memory book = getOneBook(addr);
    //     return uint256(book.loans[loanId].state);
    // }

    function getLoanItem(uint256 loanId) public view returns (LoanItem memory) {
        require(loanMap[msg.sender].isValue, 'no loan item found');
        LoanBook memory book = getOneBook(msg.sender);
        return book.loans[loanId];
    }

    function getOneBook(address addr) public view returns (LoanBook memory) {
        return loanMap[addr];
    }

    function getAllBooks() public view returns (LoanBook[] memory) {
        LoanBook[] memory allBooks = new LoanBook[](users.length);
        for (uint256 i = 0; i < users.length; i++) {
            allBooks[i] = loanMap[users[i]];
        }
        return allBooks;
    }

    function getAllUsers() public view returns (address[] memory) {
        return users;
    }

    /**@dev
        State Management Section
        1. update states
        2. notify - confirm method to change states
     */

    function updateState(
        address loanMaker,
        address colUser,
        uint256 loanId,
        uint256 amt
    ) public {
        LoanBook storage book = loanMap[loanMaker];
        LoanItem storage item = book.loans[loanId];
        require(amt == item.amt, 'confirm amount not match');
        // initial
        // LOAN: REGISTERED -> WORKING
        // COLL: AVAILABLE -> IN_USE
        if (item.state == State.REGISTERED) {
            require(colUser == item.borrower, 'borrower must confirm');
            item.state = State.WORKING;
            collateral.updateState(colUser);
        }

        // coupon is due
        // LOAN: WORKING -> DUE
        // COLL: IN_USE (no change)

        // coupon due -> paid
        // LOAN: DUE -> WORKING
        // COLL: IN_USE (no change)

        // coupon due -> unpaid
        // LOAN: DUE -> PAST_DUE
        // COLL: IN_USE -> PARTIAL_LIQUIDATION

        // coupon unpaid -> paid
        // LOAN: PAST_DUE -> WORKING
        // COLL: PARTIAL_LIQUIDATION -> IN_USE

        // redemption
        // WORKING -> DUE
        // 1) DUE -> CLOSED, IN_USE -> AVAILABLE
        // 2a) DUE -> PAST_DUE, IN_USE -> LIQUIDATION
        // 2b) PAST_DUE -> TERMINATED, LIQUIDATION -> EMPTY

        // margin call
        // 1) WORKING (no change), IN_USE -> MARGINCALL
        // 2) WORKING (no change), MARGINCALL -> IN_USE
        // 3a) WORKING (no change), MARGINCALL -> LIQUIDATION
        // 3b) WORKING -> TERMINATED, LIQUIDATION -> EMPTY
    }

    function updateAllState() public {} // TODO

    // to be used by lenders
    function notifyPayment(MoneyMarket.Ccy ccy, address receiver, uint256 loanId, string memory txHash) public {
        // used for initial, coupon, redemption, liquidation
        emit NoitfyPayment(ccy, msg.sender, receiver, loanId, txHash);
    }

    // to be used by borrowers
    function confirmPayment(
        address loanMaker,
        address colUser,
        MoneyMarket.Side side,
        MoneyMarket.Ccy ccy,
        uint256 term,
        uint256 amt,
        uint256 loanId
    ) public {
        // TODO - confirm the loan amount in FIL or in ETH
        // used for initial, coupon, redemption, liquidation
        // LoanBook storage book = loanMap[msg.sender];
        // LoanItem storage item = book.loans[loanId];

        // initial
        // REGISTERED -> WORKING
        // AVAILABLE -> IN_USE
        if (side == MoneyMarket.Side.LEND) {
            require(msg.sender == colUser, 'msg.sender is not borrower');
            updateState(loanMaker, colUser, loanId, amt);
        } else {
            require(msg.sender == loanMaker, 'msg.sender is not lender');
            updateState(loanMaker, colUser, loanId, amt);
        }
        emit ConfirmPayment(loanMaker, colUser, side, ccy, term, amt, loanId);

        // coupon
        // DUE -> WORKING
        // PAST_DUE->WORKING, PARTIAL_LIQUIATION -> IN_USE

        // redemption
        // DUE -> CLOSED, IN_USE -> AVAILABLE
        // PAST_DUE -> TERMINATED, LIQUIDATION -> EMPTY

        // margin call
        // WORKING -> TERMINATED, LIQUIDATION -> EMPTY
    }

    /**@dev
        Mark to Market Section
        1. get discount factors from moneyMarket
        2. get PV for each scheduled cashflow
        3. update LoanItem with total value of PV
     */

    // For Mark to Market
    function updateAllPV() public {
        for (uint256 i = 0; i < users.length; i++) {
            LoanItem[] storage loans = loanMap[users[i]].loans;
            for (uint256 j = 0; j < loans.length; j++) {
                updateOnePV(loans[j]);
            }
        }
    }

    // After Upsize Collateral
    function updateUserPV(address addr) public {
        LoanItem[] storage loans = loanMap[addr].loans;
        for (uint256 j = 0; j < loans.length; j++) {
            updateOnePV(loans[j]);
        }
    }

    // helper to get actual discount factors
    function calcDF(uint256[NUMDF] memory dfArr, uint256 date)
        private
        view
        returns (uint256)
    {
        // if (date == 0) return BP;
        if (date <= now) return 0;
        uint256 time = date - now;
        if (time <= SECONDS[0]) return (dfArr[0] * time) / SECONDS[0];
        // if (time <= SECONDS[0]) return (dfArr[0] * SECONDS[0]) / time;
        for (uint256 i = 1; i < NUMDF; i++) {
            if (SECONDS[i - 1] < time && time <= SECONDS[i]) {
                uint256 left = time - SECONDS[i - 1];
                uint256 right = SECONDS[i] - time;
                uint256 total = SECONDS[i] - SECONDS[i - 1];
                return (dfArr[i - 1] * right + dfArr[i] * left) / total;
            }
        }
    }

    // helper to take a loan item and update its net present value
    function updateOnePV(LoanItem storage item) private {
        MoneyMarket.DiscountFactor[NUMCCY] memory dfList = moneyMarket
            .getDiscountFactors();
        MoneyMarket.DiscountFactor memory df = dfList[uint256(item.ccy)];
        uint256[NUMDF] memory dfArr = [
            df.df3m,
            df.df6m,
            df.df1y,
            df.df2y,
            df.df3y,
            df.df4y,
            df.df5y
        ];
        uint256[MAXPAYNUM] memory schedDate = item.schedule.payments;
        uint256[MAXPAYNUM] memory schedAmt = item.schedule.amounts;
        uint256[MAXPAYNUM] memory schedDf;
        uint256 pv = 0;
        for (uint256 i = 0; i < PAYNUMS[uint256(item.term)]; i++) {
            uint256 d = calcDF(dfArr, schedDate[i]);
            schedDf[i] = d;
            pv += (schedAmt[i] * d) / BP;
        }
        uint256 lastIndex = PAYNUMS[uint256(item.term)] - 1;
        pv += (item.amt * schedDf[lastIndex]) / BP;
        item.pv = pv;
        item.asOf = now;
    }
}
