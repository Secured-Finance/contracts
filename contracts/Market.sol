// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

contract MoneyMarket {

    enum Ccy { ETH, FIL }
    enum Term { _3m, _6m, _1y, _2y, _3y, _5y}

    uint constant NUMCCY = 2;
    uint constant NUMTERM = 6;

    struct LoanBook {
        LoanItem[NUMTERM][NUMCCY] lenders;
        LoanItem[NUMTERM][NUMCCY] borrowers;
        bool isValue;
    }

    struct LoanItem {
        Term term;
        uint size;
        uint rate;
        uint goodtil;
        bool isAvailable;
        address addr;
    }

    struct LoanInput {
        Term term;
        uint size;
        uint rate;
    }

    // LoanBook [0] for ETH, [1] for FIL
    mapping(address => LoanBook) private loanMap;
    address[] private marketMakers;
    LoanBook private bestBook;

    function inputToItem(LoanInput memory input, uint goodtil) private view returns (LoanItem memory) {
        LoanItem memory item;
        item.term = input.term;
        item.size = input.size;
        item.rate = input.rate;
        item.goodtil = goodtil;
        item.isAvailable = true;
        item.addr = msg.sender;
        return item;
    }

    function setLoans(
        Ccy ccy,
        LoanInput[] memory lenders,
        LoanInput[] memory borrowers,
        uint effectiveSec
    ) public {
        // TODO - check if collateral covers borrowers sizes
        // TODO - emit event for notice
        LoanBook storage book = loanMap[msg.sender];
        LoanItem[NUMTERM] storage lenderTerms = book.lenders[uint(ccy)];
        LoanItem[NUMTERM] storage borrowerTerms = book.borrowers[uint(ccy)];
        for (uint i = 0; i < lenders.length; i++) {
            Term term = lenders[i].term;
            LoanItem memory newItem = inputToItem(lenders[i], now+effectiveSec);
            lenderTerms[uint(term)] = newItem;
            LoanItem memory bestItem = bestBook.lenders[uint(ccy)][uint(term)];
            if (!bestBook.isValue || bestItem.rate > lenders[i].rate)
                bestBook.lenders[uint(ccy)][uint(term)] = newItem;
        }
        for (uint i = 0; i < borrowers.length; i++) {
            Term term = borrowers[i].term;
            LoanItem memory newItem = inputToItem(borrowers[i], now+effectiveSec);
            borrowerTerms[uint(term)] = newItem;
            LoanItem memory bestItem = bestBook.borrowers[uint(ccy)][uint(term)];
            if (!bestBook.isValue || bestItem.rate < borrowers[i].rate)
                bestBook.borrowers[uint(ccy)][uint(term)] = newItem;
        }
        if (!loanMap[msg.sender].isValue)
            marketMakers.push(msg.sender);
        book.isValue = true;
        bestBook.isValue = true;
    }

    function getOneBook(address addr) public view returns (LoanBook memory) {
        return loanMap[addr];
    }

    function getAllBooks() public view returns (LoanBook[] memory) {
        LoanBook[] memory allBooks = new LoanBook[](marketMakers.length);
        for (uint i = 0; i < marketMakers.length; i++) {
            allBooks[i] = loanMap[marketMakers[i]];
        }
        return allBooks;
    }

    function getBestBook() public view returns (LoanBook memory) {
        return bestBook;
    }

    function getLenderRates() public view returns (uint[NUMTERM][NUMCCY] memory) {
        uint[NUMTERM][NUMCCY] memory rates;
        for (uint i = 0; i < NUMCCY; i++) {
            for (uint j = 0; j < NUMTERM; j++) {
                rates[i][j] = bestBook.lenders[i][j].rate;
            }
        }
        return rates;
    }

    function getBorrowerRates() public view returns (uint[NUMTERM][NUMCCY] memory) {
        uint[NUMTERM][NUMCCY] memory rates;
        for (uint i = 0; i < NUMCCY; i++) {
            for (uint j = 0; j < NUMTERM; j++) {
                rates[i][j] = bestBook.borrowers[i][j].rate;
            }
        }
        return rates;
    }

    function getMidRates() public view returns (uint[NUMTERM][NUMCCY] memory) {
        uint[NUMTERM][NUMCCY] memory rates;
        for (uint i = 0; i < NUMCCY; i++) {
            for (uint j = 0; j < NUMTERM; j++) {
                rates[i][j] = (bestBook.lenders[i][j].rate + bestBook.borrowers[i][j].rate)/2;
            }
        }
        return rates;
    }

    function getMarketMakers() public view returns (address[] memory) {
        return marketMakers;
    }

}

contract FXMarket {

    enum Ccy { ETH, FIL }
    enum CcyPair { FILETH }

    uint constant NUMCCY = 2;
    uint constant NUMPAIR = 1;
    uint[NUMPAIR] FXMULT = [1000];

    struct FXBook {
        FXItem[NUMPAIR] offers;
        FXItem[NUMPAIR] bids;
        bool isValue;
    }

    struct FXItem {
        CcyPair pair;
        Ccy ccyBuy;
        Ccy ccySell;
        uint amtBuy;
        uint amtSell;
        uint rate;
        uint goodtil;
        bool isAvailable;
        address addr;
    }

    struct FXInput {
        Ccy ccyBuy;
        Ccy ccySell;
        uint amtBuy;
        uint amtSell;
    }

    // FXBook [0] for FILETH
    mapping(address => FXBook) private fxMap;
    address[] private marketMakers;
    FXBook private bestBook;

    function inputToItem(CcyPair pair, FXInput memory input, uint goodtil) private view returns (FXItem memory) {
        FXItem memory item;
        item.pair = pair;
        item.ccyBuy = input.ccyBuy;
        item.ccySell = input.ccySell;
        item.amtBuy = input.amtBuy;
        item.amtSell = input.amtSell;
        item.rate = FXMULT[uint(pair)] * input.amtSell / input.amtBuy;
        item.goodtil = goodtil;
        item.isAvailable = true;
        item.addr = msg.sender;
        return item;
    }

    function setFX(
        CcyPair pair,
        FXInput memory offerInput,
        FXInput memory bidInput,
        uint effectiveSec
    ) public {
        FXBook storage book = fxMap[msg.sender];
        FXItem storage offer = book.offers[uint(pair)];
        FXItem storage bid = book.bids[uint(pair)];

        FXItem memory newOffer = inputToItem(pair, offerInput, now+effectiveSec);
        book.offers[uint(pair)] = newOffer;

        FXItem memory bestOffer = bestBook.offers[uint(pair)];
        if (!bestBook.isValue || bestOffer.rate > offer.rate)
            bestBook.offers[uint(pair)] = newOffer;

        FXItem memory newBid = inputToItem(pair, bidInput, now+effectiveSec);
        book.bids[uint(pair)] = newBid;
        FXItem memory bestBid = bestBook.bids[uint(pair)];
        if (!bestBook.isValue || bestBid.rate < bid.rate)
            bestBook.bids[uint(pair)] = newBid;

        if (!fxMap[msg.sender].isValue)
            marketMakers.push(msg.sender);
        book.isValue = true;
        bestBook.isValue = true;
    }

    function getFXBook(address addr) public view returns (FXBook memory) {
        return fxMap[addr];
    }

    function getBestFX() public view returns (FXBook memory) {
        return bestBook;
    }

    function getOfferRates() public view returns (uint[NUMPAIR] memory) {
        uint[NUMPAIR] memory rates;
        for (uint i = 0; i < NUMPAIR; i++) {
                rates[i] = bestBook.offers[i].rate;
        }
        return rates;
    }

    function getBidRates() public view returns (uint[NUMPAIR] memory) {
        uint[NUMPAIR] memory rates;
        for (uint i = 0; i < NUMPAIR; i++) {
                rates[i] = bestBook.bids[i].rate;
        }
        return rates;
    }

    function getMidRates() public view returns (uint[NUMPAIR] memory) {
        uint[NUMPAIR] memory rates;
        for (uint i = 0; i < NUMPAIR; i++) {
                rates[i] = (bestBook.offers[i].rate + bestBook.bids[i].rate)/2;
        }
        return rates;
    }

    function getMarketMakers() public view returns (address[] memory) {
        return marketMakers;
    }

}
