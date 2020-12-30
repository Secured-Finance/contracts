// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./MoneyMarket.sol";
import "./FXMarket.sol";
import "./Loan.sol";

contract Collateral {
    event SetColBook(
        address indexed addr,
        string indexed id,
        bytes32 userAddrFIL,
        address userAddrUSDC
    );
    event UpSizeETH(address indexed sender);
    event UpSizeFIL(address indexed sender);
    event DelColBook(address indexed sender);
    event PartialLiquidation(
        address indexed borrower,
        address indexed lender,
        uint256 indexed amount
    );
    event RequestFILCustodyAddr(address indexed requester);
    event RegisterFILCustodyAddr(address indexed addr);
    event DEBUG(address addr);

    enum CcyPair {FILETH, FILUSDC, ETHUSDC}
    enum State {
        EMPTY,
        AVAILABLE,
        IN_USE,
        MARGIN_CALL,
        LIQUIDATION_IN_PROGRESS,
        LIQUIDATION
    }

    uint256 constant PCT = 100;
    uint256 constant FXMULT = 1000;
    uint256 constant PENALTYLEVEL = 110; // 110% for settlement failure penalty
    uint256 constant MKTMAKELEVEL = 120;
    uint256 constant LQLEVEL = 120; // 120% for liquidation price
    uint256 constant MARGINLEVEL = 150; // 150% margin call threshold
    uint256 constant AUTOLQLEVEL = 125; // 125% auto liquidation

    struct ColBook {
        string id; // DID, email
        address userAddrETH;
        bytes32 userAddrFIL;
        address userAddrUSDC;
        bytes32 colAddrFIL;
        address colAddrUSDC;
        uint256 colAmtETH;
        uint256 colAmtFIL;
        uint256 colAmtUSDC;
        uint256 colAmtFILValue; // custody FIL amt evaluated in ETH
        uint256 colAmtUSDCValue; // custody USDC amt evaluated in ETH
        uint256 inuseETH; // total PV of ETH loans
        uint256 inuseFIL; // total PV of FIL loans
        uint256 inuseUSDC; // total PV of USDC loans
        uint256 inuseFILValue; // total PV of FIL loans evaluated in ETH
        uint256 inuseUSDCValue; // total PV of USDC loans evaluated in ETH
        uint256 coverage; // in PCT
        bool isAvailable;
        State state;
    }

    struct ColInput {
        string id; // DID, email
        bytes32 userAddrFIL;
        address userAddrUSDC;
    }

    // keeps all the records
    mapping(address => ColBook) private colMap;
    address[] private users;
    address private owner;

    // Contracts
    MoneyMarket moneyMarket;
    FXMarket fxMarket;
    Loan loan;

    constructor(address moneyAddr, address fxAddr) public {
        owner = msg.sender;
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
    }

    // reset market contracts addresses
    function setMarketAddr(address moneyAddr, address fxAddr) public {
        require(msg.sender == owner, "only owner");
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
    }

    // reset loan contract address
    function setLoanAddr(address loanAddr) public {
        require(msg.sender == owner, "only owner");
        loan = Loan(loanAddr);
    }

    /**@dev
        Register a user and make a collateral book
     */

    // register or update col book for a user
    function setColBook(
        string memory id,
        bytes32 userAddrFIL,
        address userAddrUSDC
    ) public payable {
        if (colMap[msg.sender].isAvailable) {
            colMap[msg.sender].id = id;
            colMap[msg.sender].userAddrFIL = userAddrFIL;
            colMap[msg.sender].userAddrUSDC = userAddrUSDC;
        } else {
            ColInput memory input = ColInput(id, userAddrFIL, userAddrUSDC);
            ColBook memory newBook = inputToBook(input);
            colMap[msg.sender] = newBook;
            users.push(msg.sender);
        }
        // updateState(msg.sender);
        emit SetColBook(msg.sender, id, userAddrFIL, userAddrUSDC);
    }

    // helper to convert input data to ColBook
    function inputToBook(ColInput memory input)
        private
        view
        returns (ColBook memory)
    {
        ColBook memory book;
        book.id = input.id;
        book.userAddrETH = msg.sender;
        book.userAddrFIL = input.userAddrFIL;
        book.userAddrUSDC = input.userAddrUSDC;
        book.colAddrFIL;
        book.colAddrUSDC;
        book.colAmtETH = msg.value;
        book.colAmtFIL = 0; // oracle will update
        book.colAmtUSDC = 0; // sync with ERC20
        book.colAmtFILValue = 0;
        book.colAmtUSDCValue = 0;
        book.inuseETH = 0; // updated by ETH loan
        book.inuseFIL = 0; // updated by FIL loan
        book.inuseUSDC = 0; // updated by USDC loan
        book.inuseFILValue = 0;
        book.inuseUSDCValue = 0;
        book.coverage = 0;
        book.isAvailable = true;
        // book.state = State.EMPTY;
        book.state = msg.value > 0 ? State.AVAILABLE : State.EMPTY;
        return book;
    }

    // helper to make loan deal to check coverage and update ColBook
    function useCollateral(
        MoneyMarket.Ccy ccy,
        uint256 amt,
        address addr
    ) public {
        require(isCovered(amt, ccy, addr), "Please upsize collateral");
        ColBook storage book = colMap[addr];
        if (ccy == MoneyMarket.Ccy.ETH) book.inuseETH += amt;
        if (ccy == MoneyMarket.Ccy.FIL) book.inuseFIL += amt;
        if (ccy == MoneyMarket.Ccy.USDC) book.inuseUSDC += amt;
        updateFILValue(addr);
        updateUSDCValue(addr);
    }

    // helper to check collateral coverage
    function isCovered(
        uint256 amt,
        MoneyMarket.Ccy ccy, // ETH or FIL
        address addr
    ) public view returns (bool) {
        require(colMap[addr].isAvailable, "not registered yet");
        if (amt == 0) return true;
        ColBook memory book = colMap[addr];
        uint256 FILETH = getFILETH();
        uint256 ETHUSDC = getETHUSDC();
        uint256 toBeUsed = 0;
        if (ccy == MoneyMarket.Ccy.ETH) toBeUsed = amt;
        if (ccy == MoneyMarket.Ccy.FIL) toBeUsed = (amt * FILETH) / FXMULT;
        if (ccy == MoneyMarket.Ccy.USDC) toBeUsed = amt / ETHUSDC; // TODO - use safe math
        uint256 totalUse = book.inuseETH +
            book.inuseFILValue +
            book.inuseUSDCValue +
            toBeUsed;
        uint256 totalAmt = book.colAmtETH + book.colAmtFILValue + book.colAmtUSDCValue;
        uint256 coverage = (PCT * totalAmt) / totalUse;
        return coverage > MARGINLEVEL;
    }

    function releaseCollateral(
        MoneyMarket.Ccy ccy,
        uint256 amt,
        address addr
    ) external {
        require(msg.sender == address(loan), "only Loan contract can call");
        ColBook storage book = colMap[addr];
        if (ccy == MoneyMarket.Ccy.ETH) book.inuseETH -= amt;
        if (ccy == MoneyMarket.Ccy.FIL) book.inuseFIL -= amt;
        if (ccy == MoneyMarket.Ccy.USDC) book.inuseUSDC -= amt;
        updateState(addr);
    }

    function withdrawCollaretal(MoneyMarket.Ccy ccy, uint256 amt) public {
        ColBook storage book = colMap[msg.sender];
        require(book.isAvailable, "not registered yet");
        // require(book.state == State.IN_USE || book.state == State.AVAILABLE, "State should be IN_USE or AVAILABLE");
        // TODO - limit amt to keep 150%
        // if (book.state == State.IN_USE || book.state == State.AVAILABLE) {
        if (ccy == MoneyMarket.Ccy.ETH) {
            book.colAmtETH -= amt;
            // msg.sender.transfer(amt); // TODO
        }
        if (ccy == MoneyMarket.Ccy.FIL) book.colAmtFIL -= amt;
        if (ccy == MoneyMarket.Ccy.USDC) book.colAmtUSDC -= amt;
        // }
        updateState(msg.sender);
    }

    // helper to calc coverage in PCT
    function getCoverage(uint256 amt, address addr)
        public
        view
        returns (uint256)
    {
        require(colMap[addr].isAvailable, "not registered yet");
        if (amt == 0) return 0;
        ColBook memory book = colMap[addr];
        uint256 totalUse = book.inuseETH + book.inuseFILValue + amt;
        uint256 totalAmt = book.colAmtETH + book.colAmtFILValue;
        uint256 coverage = (PCT * totalAmt) / totalUse;
        return coverage;
    }

    /**@dev
        State Management Section
        1. update states
        2. notify - confirm method to change states

        // TODO - modify inuseETH after loan is executed
        // TODO - update loan mtm condition and change state
     */

    // DEBUG
    function addressToString(address _addr)
        public
        pure
        returns (string memory)
    {
        bytes32 value = bytes32(uint256(_addr));
        bytes memory alphabet = "0123456789abcdef";

        bytes memory str = new bytes(51);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint256(uint8(value[i + 12] >> 4))];
            str[3 + i * 2] = alphabet[uint256(uint8(value[i + 12] & 0x0f))];
        }
        return string(str);
    }

    // update state and coverage
    // TODO - access control to loan
    function updateState(address addr) public returns (State) {
        ColBook storage book = colMap[addr];
        updateFILValue(addr);
        updateUSDCValue(addr);
        uint256 totalUse = book.inuseETH +
            book.inuseFILValue +
            book.inuseUSDCValue;
        uint256 totalAmt = book.colAmtETH + book.colAmtFILValue + book.colAmtUSDCValue;
        if (totalUse == 0) {
            book.coverage = 0;
            if (totalAmt == 0) book.state = State.EMPTY;
            if (totalAmt > 0) book.state = State.AVAILABLE;
        } else if (totalUse > 0) {
            uint256 coverage = (PCT * totalAmt) / totalUse;
            book.coverage = coverage;
            // TODO - handle partial liquidation and margin call together
            if (book.state == State.LIQUIDATION_IN_PROGRESS) return book.state;
            if (totalAmt > 0 && coverage <= AUTOLQLEVEL)
                book.state = State.LIQUIDATION;
            if (totalAmt > 0 && coverage > AUTOLQLEVEL)
                book.state = State.MARGIN_CALL;
            if (totalAmt > 0 && coverage > MARGINLEVEL)
                book.state = State.IN_USE;
            return book.state;
        }
    }

    // update state all
    function updateAllState() public {
        for (uint256 i = 0; i < users.length; i++) {
            updateState(users[i]);
        }
    }

    // to be called from Loan for coupon and redemption cover
    function partialLiquidation(
        address borrower,
        address lender,
        uint256 amount,
        MoneyMarket.Ccy ccy
    ) external {
        require(msg.sender == address(loan), "only Loan contract can call");
        ColBook storage borrowerBook = colMap[borrower];
        ColBook storage lenderBook = colMap[lender];
        uint256 colAmtETH = fxMarket.getETHvalue(amount, ccy);
        require(borrowerBook.colAmtETH >= colAmtETH, "Liquidation amount not enough");
        if (
            borrowerBook.state == State.IN_USE ||
            borrowerBook.state == State.LIQUIDATION
        ) {
            borrowerBook.state = State.LIQUIDATION_IN_PROGRESS;
            borrowerBook.colAmtETH -= (colAmtETH * LQLEVEL) / PCT;
            lenderBook.colAmtETH += (colAmtETH * LQLEVEL) / PCT;
            updateState(borrower);
        }
        emit PartialLiquidation(borrower, lender, amount);
    }

    function completePartialLiquidation(address borrower) external {
        require(msg.sender == address(loan), "only Loan contract can call");
        ColBook storage borrowerBook = colMap[borrower];
        borrowerBook.state = State.IN_USE; // set to default before update
        updateState(borrower);
    }

    // TODO
    function liquiadtion(address borrower, uint256 amount) public {}

    // to be called from Loan to pay liquidation provider
    // function recoverPartialLiquidation(
    //     address borrower,
    //     address liquidProvider,
    //     uint256 amount
    // ) public {
    //     require(msg.sender == address(loan), 'only Loan contract can call');
    //     ColBook storage book = colMap[borrower];
    //     require(
    //         book.state == State.LIQUIDATION_IN_PROGRESS,
    //         'expecting LIQUIDATION_IN_PROGRESS state'
    //     );
    //     uint256 recoverAmount = (amount * LQLEVEL) / PCT;
    //     // TODO - handle ETH lending case
    //     book.inuseFIL -= amount;
    //     book.colAmtFIL -= recoverAmount;
    //     book.state = State.IN_USE;
    //     updateState(borrower);
    // }

    // function confirmFILPayment(address addr) public {
    //     // TODO - only called by Lender (maybe move to Loan)
    //     ColBook storage book = colMap[addr];
    //     if (book.state == State.LIQUIDATION_IN_PROGRESS) {
    //         book.state = State.IN_USE;
    //         // TODO - release Collateral
    //     }
    //     updateState(addr);
    // }

    // collateralize ETH
    function upSizeETH() public payable {
        require(colMap[msg.sender].isAvailable == true, "user not found");
        colMap[msg.sender].colAmtETH += msg.value;
        updateState(msg.sender);
        if (
            (colMap[msg.sender].state != State.AVAILABLE) &&
            (colMap[msg.sender].state != State.IN_USE)
        ) revert("Collateral not enough");
        emit UpSizeETH(msg.sender);
    }

    // collateralize FIL
    function upSizeFIL(uint256 colAmtFIL) public payable {
        require(colMap[msg.sender].isAvailable == true, "user not found");
        colMap[msg.sender].colAmtFIL += colAmtFIL;
        // TODO - check FIL network by other peers to verify colAmtFIL
        updateState(msg.sender);
        emit UpSizeFIL(msg.sender);
    }

    function emptyBook(ColBook storage book) private {
        book.id = "";
        book.userAddrETH = 0x0000000000000000000000000000000000000000;
        book.colAddrFIL = "";
        book.userAddrFIL = "";
        book.colAddrUSDC = 0x0000000000000000000000000000000000000000;
        book.userAddrUSDC = 0x0000000000000000000000000000000000000000;
        book.colAmtETH = 0;
        book.colAmtFIL = 0;
        book.colAmtUSDC = 0;
        book.colAmtFILValue = 0;
        book.colAmtUSDCValue = 0;
        book.inuseETH = 0;
        book.inuseFIL = 0;
        book.inuseUSDC = 0;
        book.inuseFILValue = 0;
        book.inuseUSDCValue = 0;
        book.coverage = 0;
        book.isAvailable = false;
        book.state = State.EMPTY;
    }

    // to be called from market maker
    function delColBook() public {
        ColBook memory book = colMap[msg.sender];
        require(book.isAvailable == true, "user not found");
        emptyBook(colMap[msg.sender]);
        delete colMap[msg.sender]; // avoid reentrancy
        msg.sender.transfer(book.colAmtETH);
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == msg.sender) delete users[i];
        } // users.length no change
        // colAmtFIL; // TODO - return FIL
        emit DelColBook(msg.sender);
    }

    function getOneBook(address addr) public view returns (ColBook memory) {
        return colMap[addr];
    }

    function getAllBooks() public view returns (ColBook[] memory) {
        ColBook[] memory allBooks = new ColBook[](users.length);
        for (uint256 i = 0; i < users.length; i++) {
            allBooks[i] = colMap[users[i]];
        }
        return allBooks;
    }

    function getAllUsers() public view returns (address[] memory) {
        return users;
    }

    function getColState(address addr) public view returns (State) {
        return colMap[addr].state;
    }

    /**dev
        Update FIL Value in ETH Section
        1. get the latest FILETH currency rate from fxMarket
        2. apply FILETH rate to colAmtFIL and inuseFIL
        3. update colAmtFILValue and inuseFILValue as ETH value
     */

    // helper to get FILETH mid rate for valuation
    function getFILETH() public view returns (uint256) {
        uint256[3] memory rates = fxMarket.getMidRates();
        return rates[uint256(CcyPair.FILETH)];
    }

    // update for one user
    function updateFILValue(address addr) public {
        uint256 fxRate = getFILETH();
        colMap[addr].colAmtFILValue = (colMap[addr].colAmtFIL * fxRate) / FXMULT;
        colMap[addr].inuseFILValue = (colMap[addr].inuseFIL * fxRate) / FXMULT;
    }

    // to be called relularly
    function updateAllFILValue() public {
        uint256 fxRate = getFILETH();
        for (uint256 i = 0; i < users.length; i++) {
            colMap[users[i]].colAmtFILValue =
                (colMap[users[i]].colAmtFIL * fxRate) /
                FXMULT;
            colMap[users[i]].inuseFILValue =
                (colMap[users[i]].inuseFIL * fxRate) /
                FXMULT;
        }
    }

    // TODO - getFILUSDC, getETHUSDC, updateUSDCValue

    /**dev
        Update USDC Value in ETH Section
        1. get the latest ETHUSDC currency rate from fxMarket
        2. apply ETHUSDC rate to colAmtFIL and inuseFIL
        3. update colAmtUSDCValue and inuseUSDCValue as ETH value
     */

    // helper to get ETHUSDC mid rate for valuation
    function getETHUSDC() public view returns (uint256) {
        uint256[3] memory rates = fxMarket.getMidRates();
        return rates[uint256(CcyPair.ETHUSDC)];
    }

    // update for one user
    function updateUSDCValue(address addr) public {
        uint256 fxRate = getETHUSDC();
        colMap[addr].colAmtUSDCValue = (colMap[addr].colAmtUSDC / fxRate);
        colMap[addr].inuseUSDCValue = (colMap[addr].inuseUSDC / fxRate);
    }

    // to be called relularly
    function updateAllUSDCValue() public {
        uint256 fxRate = getETHUSDC();
        for (uint256 i = 0; i < users.length; i++) {
            colMap[users[i]].colAmtUSDCValue =
                (colMap[users[i]].colAmtUSDC * fxRate) /
                FXMULT;
            colMap[users[i]].inuseUSDCValue =
                (colMap[users[i]].inuseUSDC * fxRate) /
                FXMULT;
        }
    }

    /**@dev
        FIL Custody Address Section
        1. emit message to request FIL custody address
        2. register FIL custody address for the requester
        3. random number can be generated from our market oracle
        4. pick random FIL custody address and let others to input its balance
        5. random verification updates FIL custody balance decentralized way
        6. this is used when market makers want to set their bit/offer quote
     */

    // to be called by market makers
    function requestFILCustodyAddr() public {
        emit RequestFILCustodyAddr(msg.sender);
    }

    // to be called by whitelisted scheduler
    function registerFILCustodyAddr(bytes32 colAddrFIL, address addr)
        public
    {
        require(colMap[addr].isAvailable == true, "user not found");
        colMap[addr].colAddrFIL = colAddrFIL;
        emit RegisterFILCustodyAddr(addr);
    }

    // helper to check empty string
    function isEmptyStr(string memory str) private pure returns (bool) {
        bytes memory byteStr = bytes(str);
        return byteStr.length == 0;
    }

    function getAllFILCustodyAddr() public view returns (bytes32[] memory) {
        bytes32[] memory addrList = new bytes32[](users.length);
        uint256 j = 0;
        for (uint256 i = 0; i < users.length; i++) {
            bytes32 colAddrFIL = colMap[users[i]].colAddrFIL;
            // if (!isEmptyStr(colAddrFIL)) addrList[j++] = colAddrFIL;
            if (colAddrFIL.length > 0) addrList[j++] = colAddrFIL;
        }
        return addrList;
    }

    // helper to generate random using market oracle
    function getRandom(uint256 seed) public view returns (uint256) {
        address[] memory fxMakers = fxMarket.getMarketMakers();
        address[] memory loanMakers = moneyMarket.getMarketMakers();
        uint256 rand = uint256(
            keccak256(abi.encode(uint256(users[0]) ^ seed ^ now))
        );
        for (uint256 i = 0; i < fxMakers.length; i++) {
            rand ^= uint256(
                keccak256(abi.encode(uint256(fxMakers[0]) ^ seed ^ now))
            );
        }
        for (uint256 i = 0; i < loanMakers.length; i++) {
            rand ^= uint256(
                keccak256(abi.encode(uint256(loanMakers[0]) ^ seed ^ now))
            );
        }
        return rand;
    }

    // helper to check string equality
    function isEqualStr(string memory a, string memory b)
        private
        pure
        returns (bool)
    {
        return (keccak256(abi.encodePacked(a)) ==
            keccak256(abi.encodePacked(b)));
    }

    // to be called by market makers
    // ramdomly pick a FILCustoryAddr to verify FIL balance for others
    function getRandFILCustodyAddr(uint256 seed)
        public
        view
        returns (bytes32)
    {
        bytes32[] memory addrList = getAllFILCustodyAddr();
        uint256 rand = getRandom(users.length + seed) % addrList.length;
        // if (isEqualStr(addrList[rand], colMap[msg.sender].colAddrFIL))
        if (addrList[rand] == colMap[msg.sender].colAddrFIL)
            return getRandFILCustodyAddr(seed + 1); // avoid verify balance myself
        return addrList[rand];
    }
}
