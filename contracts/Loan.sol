// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import './Market.sol';
import './Collateral.sol';

contract Loan {
    // (Execution)
    // 1. Deploy from market taker (maker addr, side, ccy, term, amt)
    // 2. Check collateral coverage and state
    // 3. If loan size is ok, delete one item from MoneyMarket
    // 4. loan state REGISTERED (prev: DEPLOYED)
    // 5. Emit message MakeLoanDeal or revert (prev: UpSize)
    // 6. Input FIL txHash and emit FIL FundArrived
    // 7. Taker manually check Filecoin network
    // 8. Taker confirmLoanAmount and make loan state BEGIN and emit LoanBegin
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

    event SetLoanBook(address indexed sender);

    enum State {REGISTERED, BEGIN, CLOSED, TERMINATED}

    uint256 constant PCT = 100;
    uint256 constant FXMULT = 1000; // convert FILETH = 0.085 to 85
    uint256 constant BP = 10000; // basis point
    uint256 constant PAYFREQ = 1; // annualy
    uint256 constant NOTICE = 2 weeks;
    uint256 constant NUMTERM = 6;
    uint256 constant MAXYEAR = 5; // years
    uint256 constant MAXPAYNUM = PAYFREQ * MAXYEAR;

    // for end date
    uint256[NUMTERM] DAYS = [
        90 days,
        180 days,
        365 days,
        365 days * 2,
        365 days * 3,
        365 days * 5
    ];
    // for coupon calc (in basis points)
    uint256[NUMTERM] DAYCOUNTFRACTIONS = [
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

    uint256[NUMTERM] PAYNUMS = [1, 1, 1, 2, 3, 5];

    struct LoanBook {
        LoanItem[] loans;
        bool isValue;
    }

    struct LoanItem {
        address lender;
        address borrower;
        MoneyMarket.Side side;
        MoneyMarket.Ccy ccy;
        MoneyMarket.Term term;
        uint256 amt;
        uint256 rate;
        Schedule schedule;
        uint256 pv; // valuation in ETH
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
            amounts[i] =
                (amt * rate * DAYCOUNTFRACTIONS[uint256(term)]) /
                (BP * BP);
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

    function inputToItem(LoanInput memory input, uint256 rate)
        private
        view
        returns (LoanItem memory)
    {
        LoanItem memory item;
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
        item.isAvailable = true;
        item.state = State.REGISTERED;
        return item;
    }

    // to be called by market takers to register loan
    function makeLoanDeal(
        address makerAddr,
        MoneyMarket.Side side,
        MoneyMarket.Ccy ccy,
        MoneyMarket.Term term,
        uint256 amt
    ) public {
        require(makerAddr != msg.sender, 'Same person deal is not allowed');
        uint256 rate = moneyMarket.takeOneItem(makerAddr, side, ccy, term, amt);
        LoanBook storage book = loanMap[msg.sender];
        LoanInput memory input = LoanInput(makerAddr, side, ccy, term, amt);
        LoanItem memory newItem = inputToItem(input, rate);
        book.loans.push(newItem);
        book.isValue = true;
        users.push(msg.sender);
        emit SetLoanBook(msg.sender);
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
}
