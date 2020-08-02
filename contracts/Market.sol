// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

contract MoneyMarket {
    event SetLoanBook(address indexed sender);
    event DelLoanBook(address indexed sender);
    event DelOneItem(address indexed sender);

    enum Ccy {ETH, FIL}
    enum Term {_3m, _6m, _1y, _2y, _3y, _5y}
    enum Side {LEND, BORROW}

    uint256 constant NUMCCY = 2;
    uint256 constant NUMTERM = 6;

    struct LoanBook {
        LoanItem[NUMTERM][NUMCCY] lenders;
        LoanItem[NUMTERM][NUMCCY] borrowers;
        bool isValue;
    }

    struct LoanItem {
        Term term;
        uint256 size;
        uint256 rate; // bps
        uint256 goodtil;
        bool isAvailable;
        address addr;
    }

    struct LoanInput {
        Term term;
        uint256 size;
        uint256 rate;
    }

    // keeps all the records
    // LoanBook [0] for ETH, [1] for FIL
    mapping(address => LoanBook) private loanMap;
    address[] private marketMakers;

    // helper to convert input data to LoanItem
    function inputToItem(LoanInput memory input, uint256 goodtil)
        private
        view
        returns (LoanItem memory)
    {
        LoanItem memory item;
        item.term = input.term;
        item.size = input.size;
        item.rate = input.rate;
        item.goodtil = goodtil;
        item.isAvailable = true;
        item.addr = msg.sender;
        return item;
    }

    // to be called by market makers for booking
    function setLoanBook(
        Ccy ccy,
        LoanInput[] memory lenders,
        LoanInput[] memory borrowers,
        uint256 effectiveSec
    ) public {
        // TODO - check if collateral covers borrowers sizes
        // TODO - emit event for notice
        // TODO - handle goodtill -- require(now >= goodtill)
        LoanBook storage book = loanMap[msg.sender];
        LoanItem[NUMTERM] storage lenderTerms = book.lenders[uint256(ccy)];
        LoanItem[NUMTERM] storage borrowerTerms = book.borrowers[uint256(ccy)];
        for (uint256 i = 0; i < lenders.length; i++) {
            Term term = lenders[i].term;
            LoanItem memory newItem = inputToItem(
                lenders[i],
                now + effectiveSec
            );
            lenderTerms[uint256(term)] = newItem;
        }
        for (uint256 i = 0; i < borrowers.length; i++) {
            Term term = borrowers[i].term;
            LoanItem memory newItem = inputToItem(
                borrowers[i],
                now + effectiveSec
            );
            borrowerTerms[uint256(term)] = newItem;
        }
        if (!loanMap[msg.sender].isValue) marketMakers.push(msg.sender);
        book.isValue = true;
        emit SetLoanBook(msg.sender);
    }

    function delLoanBook() public {
        require(loanMap[msg.sender].isValue == true, 'loanBook not found');
        delete loanMap[msg.sender];
        for (uint256 i = 0; i < marketMakers.length; i++) {
            if (marketMakers[i] == msg.sender) delete marketMakers[i];
        } // marketMakers.length no change
        emit DelLoanBook(msg.sender);
    }

    // TODO - [internal] delete from loan contract. require(loanMap[marketMaker] == true)

    function delOneItem(
        address addr,
        Side side,
        Ccy ccy,
        Term term
    ) public {
        require(loanMap[msg.sender].isValue == true, 'loanBook not found');
        if (side == Side.LEND)
            delete loanMap[addr].lenders[uint256(ccy)][uint256(term)];
        else delete loanMap[addr].borrowers[uint256(ccy)][uint256(term)];
        emit DelOneItem(msg.sender);
    }

    function getOneItem(
        address addr,
        Side side,
        Ccy ccy,
        Term term
    ) public view returns (LoanItem memory) {
        if (side == Side.LEND)
            return loanMap[addr].lenders[uint256(ccy)][uint256(term)];
        else return loanMap[addr].borrowers[uint256(ccy)][uint256(term)];
    }

    function getOneBook(address addr) public view returns (LoanBook memory) {
        return loanMap[addr];
    }

    function getAllBooks() public view returns (LoanBook[] memory) {
        LoanBook[] memory allBooks = new LoanBook[](marketMakers.length);
        for (uint256 i = 0; i < marketMakers.length; i++) {
            allBooks[i] = loanMap[marketMakers[i]];
        }
        return allBooks;
    }

    // priority on lower lend rate, higher borrow rate, larger size
    function betterItem(
        LoanItem memory a,
        LoanItem memory b,
        Side side
    ) private pure returns (LoanItem memory) {
        if (!a.isAvailable) return b;
        if (!b.isAvailable) return a;
        if (a.rate == b.rate) return a.size > b.size ? a : b;
        if (side == Side.LEND) return a.rate < b.rate ? a : b;
        return a.rate > b.rate ? a : b; // Side.BORROW
    }

    function getBestBook() public view returns (LoanBook memory) {
        LoanBook memory book;
        for (uint256 i = 0; i < NUMCCY; i++) {
            for (uint256 j = 0; j < NUMTERM; j++) {
                for (uint256 k = 0; k < marketMakers.length; k++) {
                    book.lenders[i][j] = betterItem(
                        book.lenders[i][j],
                        loanMap[marketMakers[k]].lenders[i][j],
                        Side.LEND
                    );
                    book.borrowers[i][j] = betterItem(
                        book.borrowers[i][j],
                        loanMap[marketMakers[k]].borrowers[i][j],
                        Side.LEND
                    );
                }
            }
        }
        return book;
    }

    function getLenderRates()
        public
        view
        returns (uint256[NUMTERM][NUMCCY] memory)
    {
        LoanBook memory bestBook = getBestBook();
        uint256[NUMTERM][NUMCCY] memory rates;
        for (uint256 i = 0; i < NUMCCY; i++) {
            for (uint256 j = 0; j < NUMTERM; j++) {
                rates[i][j] = bestBook.lenders[i][j].rate;
            }
        }
        return rates;
    }

    function getBorrowerRates()
        public
        view
        returns (uint256[NUMTERM][NUMCCY] memory)
    {
        LoanBook memory bestBook = getBestBook();
        uint256[NUMTERM][NUMCCY] memory rates;
        for (uint256 i = 0; i < NUMCCY; i++) {
            for (uint256 j = 0; j < NUMTERM; j++) {
                rates[i][j] = bestBook.borrowers[i][j].rate;
            }
        }
        return rates;
    }

    // to be called by Loan or Collateral for valuation
    function getMidRates()
        public
        view
        returns (uint256[NUMTERM][NUMCCY] memory)
    {
        LoanBook memory bestBook = getBestBook();
        uint256[NUMTERM][NUMCCY] memory rates;
        for (uint256 i = 0; i < NUMCCY; i++) {
            for (uint256 j = 0; j < NUMTERM; j++) {
                rates[i][j] =
                    (bestBook.lenders[i][j].rate +
                        bestBook.borrowers[i][j].rate) /
                    2;
            }
        }
        return rates;
    }

    function getMarketMakers() public view returns (address[] memory) {
        return marketMakers;
    }
}

contract FXMarket {
    event SetFXBook(address indexed sender);
    event DelFXBook(address indexed sender);
    event DelOneItem(address indexed sender);

    enum Ccy {ETH, FIL}
    enum CcyPair {FILETH}
    enum Side {BID, OFFER}

    uint256 constant NUMCCY = 2;
    uint256 constant NUMPAIR = 1;
    uint256[NUMPAIR] FXMULT = [1000];

    struct FXBook {
        FXItem[NUMPAIR] bids;
        FXItem[NUMPAIR] offers;
        bool isValue;
    }

    struct FXItem {
        CcyPair pair;
        Ccy ccyBuy;
        Ccy ccySell;
        uint256 amtBuy;
        uint256 amtSell;
        uint256 rate;
        uint256 goodtil;
        bool isAvailable;
        address addr;
    }

    struct FXInput {
        Ccy ccyBuy;
        Ccy ccySell;
        uint256 amtBuy;
        uint256 amtSell;
    }

    // keeps all the records
    // FXBook [0] for FILETH
    mapping(address => FXBook) private fxMap;
    address[] private marketMakers;

    event DEBUG(uint amtBuy, uint amtSell, uint fxRate);

    // helper to convert input to FXItem
    function inputToItem(
        CcyPair pair,
        FXInput memory input,
        uint256 goodtil
    ) private view returns (FXItem memory) {
        FXItem memory item;
        item.pair = pair;
        item.ccyBuy = input.ccyBuy;
        item.ccySell = input.ccySell;
        item.amtBuy = input.amtBuy;
        item.amtSell = input.amtSell;
        uint fxRate;
        if (input.ccySell == Ccy.FIL) // ETH buy FIL sell
            fxRate = (FXMULT[uint256(pair)] * input.amtBuy) / input.amtSell;
        else // ETH sell FIL buy
            fxRate = (FXMULT[uint256(pair)] * input.amtSell) / input.amtBuy;
        item.rate = fxRate;
        item.goodtil = goodtil;
        item.isAvailable = true;
        item.addr = msg.sender;
        return item;
    }

    // to be called by market makers for booking
    function setFXBook(
        CcyPair pair,
        FXInput memory offerInput,
        FXInput memory bidInput,
        uint256 effectiveSec
    ) public {
        // TODO - check if collateral covers borrowers sizes
        // TODO - emit event for notice
        FXBook storage book = fxMap[msg.sender];
        FXItem memory newOffer = inputToItem(
            pair,
            offerInput,
            now + effectiveSec
        );
        book.offers[uint256(pair)] = newOffer;
        FXItem memory newBid = inputToItem(pair, bidInput, now + effectiveSec);
        book.bids[uint256(pair)] = newBid;
        if (!fxMap[msg.sender].isValue) marketMakers.push(msg.sender);
        book.isValue = true;
        emit SetFXBook(msg.sender);
    }

    function delFXBook() public {
        require(fxMap[msg.sender].isValue == true, 'fxBook not found');
        delete fxMap[msg.sender];
        for (uint256 i = 0; i < marketMakers.length; i++) {
            if (marketMakers[i] == msg.sender) delete marketMakers[i];
        } // marketMakers.length no change
        emit DelFXBook(msg.sender);
    }

    function delOneItem(
        address addr,
        Side side,
        CcyPair pair
    ) public {
        require(fxMap[msg.sender].isValue == true, 'fxBook not found');
        if (side == Side.BID) delete fxMap[addr].bids[uint256(pair)];
        else delete fxMap[addr].offers[uint256(pair)];
        emit DelOneItem(msg.sender);
    }

    function getOneItem(
        address addr,
        Side side,
        CcyPair pair
    ) public view returns (FXItem memory) {
        if (side == Side.BID) return fxMap[addr].bids[uint256(pair)];
        else return fxMap[addr].offers[uint256(pair)];
    }

    function getOneBook(address addr) public view returns (FXBook memory) {
        return fxMap[addr];
    }

    function getAllBooks() public view returns (FXBook[] memory) {
        FXBook[] memory allBooks = new FXBook[](marketMakers.length);
        for (uint256 i = 0; i < marketMakers.length; i++) {
            allBooks[i] = fxMap[marketMakers[i]];
        }
        return allBooks;
    }

    // priority on lower offer rate, higher bid rate, larger size
    function betterItem(
        FXItem memory a,
        FXItem memory b,
        Side side
    ) private pure returns (FXItem memory) {
        if (!a.isAvailable) return b;
        if (!b.isAvailable) return a;
        if (a.rate == b.rate) return a.amtBuy > b.amtBuy ? a : b;
        if (side == Side.OFFER) return a.rate < b.rate ? a : b;
        return a.rate > b.rate ? a : b; // Side.BID
    }

    function getBestBook() public view returns (FXBook memory) {
        FXBook memory book;
        for (uint256 i = 0; i < NUMPAIR; i++) {
            for (uint256 k = 0; k < marketMakers.length; k++) {
                book.bids[i] = betterItem(
                    book.bids[i],
                    fxMap[marketMakers[k]].bids[i],
                    Side.BID
                );
                book.offers[i] = betterItem(
                    book.offers[i],
                    fxMap[marketMakers[k]].offers[i],
                    Side.OFFER
                );
            }
        }
        return book;
    }

    function getOfferRates() public view returns (uint256[NUMPAIR] memory) {
        FXBook memory bestBook = getBestBook();
        uint256[NUMPAIR] memory rates;
        for (uint256 i = 0; i < NUMPAIR; i++) {
            rates[i] = bestBook.offers[i].rate;
        }
        return rates;
    }

    function getBidRates() public view returns (uint256[NUMPAIR] memory) {
        FXBook memory bestBook = getBestBook();
        uint256[NUMPAIR] memory rates;
        for (uint256 i = 0; i < NUMPAIR; i++) {
            rates[i] = bestBook.bids[i].rate;
        }
        return rates;
    }


    function getMidRates() public view returns (uint256[NUMPAIR] memory) {
        FXBook memory bestBook = getBestBook();
        uint256[NUMPAIR] memory rates;
        for (uint256 i = 0; i < NUMPAIR; i++) {
            rates[i] = (bestBook.offers[i].rate + bestBook.bids[i].rate) / 2;
        }
        return rates;
    }

    // to be called by Loan or Collateral for valuation
    function getMarketMakers() public view returns (address[] memory) {
        return marketMakers;
    }
}
