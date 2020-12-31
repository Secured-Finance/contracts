// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import './MoneyMarket.sol';

contract FXMarket {
    event SetFXBook(address indexed addr);
    event DelFXBook(address indexed addr);
    event DelOneItem(address indexed addr);

    enum Ccy {ETH, FIL, USDC}
    enum CcyPair {FILETH, FILUSDC, ETHUSDC}
    enum Side {BID, OFFER}

    uint256 constant NUMCCY = 3;
    uint256 constant NUMPAIR = 3;
    uint256[NUMPAIR] FXMULT = [1000, 1, 1];

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

    // to be called by Loan or Collateral for valuation
    function getMarketMakers() public view returns (address[] memory) {
        return marketMakers;
    }

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
        // TODO - check if collateral covers borrowers amts
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
        fxMap[msg.sender].isValue = false;
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
        require(fxMap[addr].isValue == true, 'fxBook not found');
        if (side == Side.BID) delete fxMap[addr].bids[uint256(pair)];
        else delete fxMap[addr].offers[uint256(pair)];
        emit DelOneItem(addr);
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

    // priority on lower offer rate, higher bid rate, larger amt
    function betterItem(
        FXItem memory a,
        FXItem memory b,
        Side side
    ) private pure returns (FXItem memory) {
        require(a.isAvailable || b.isAvailable, 'Not enough FX Data');
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

    function getETHvalue(uint256 amount, MoneyMarket.Ccy ccy) public view returns (uint256) {
        uint256[3] memory rates = getMidRates();
        if (ccy == MoneyMarket.Ccy.FIL) {
            uint256 pairIndex = uint256(CcyPair.FILETH);
            uint256 mult = FXMULT[pairIndex];
            return rates[pairIndex] * amount / mult;
        }
        if (ccy == MoneyMarket.Ccy.USDC) {
            uint256 pairIndex = uint256(CcyPair.ETHUSDC);
            uint256 mult = FXMULT[pairIndex];
            // TODO - add more presicion to handle fractional value ETH
            return amount / (rates[pairIndex] / mult);
        }
    }
}
