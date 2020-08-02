// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import './Market.sol';

contract Collateral {
    event SetColBook(address indexed sender);
    event UpSizeETH(address indexed sender);
    event UpSizeFIL(address indexed sender);
    event DelColBook(address indexed sender);
    event RequestFILCustodyAddr(address indexed sender);
    event RegisterFILCustodyAddr(address indexed requester);

    enum CcyPair {FILETH}
    enum State {EMPTY, AVAILABLE, IN_USE, MARGINCALL, LIQUIDATION}

    uint256 constant PCT = 100;
    uint256 constant FXMULT = 1000;

    struct ColBook {
        string id; // DID, email
        address addrETH;
        string addrFIL;
        string custodyAddrFIL;
        uint256 inuseETH;
        uint256 inuseFIL;
        uint256 amtETH;
        uint256 amtFIL;
        uint256 valueFIL; // evaluated in ETH
        bool isAvailable;
        State state;
    }

    // TODO - modify inuseETH after loan is executed
    // TODO - update loan mtm condition and change state

    struct ColInput {
        string id;
        string addrFIL;
    }

    // keeps all the records
    mapping(address => ColBook) private colMap;
    address[] private users;
    address private owner;

    // Contracts
    MoneyMarket moneyMarket;
    FXMarket fxMarket;

    constructor (address moneyAddr, address fxAddr) public {
        owner = msg.sender;
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
    }

    // reset market contracts to interact
    function setMarketAddr(address moneyAddr, address fxAddr) public {
        require(msg.sender == owner, 'only owner');
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
    }

    // helper to convert input data to ColBook
    function inputToBook(ColInput memory input)
        private
        view
        returns (ColBook memory)
    {
        ColBook memory book;
        book.id = input.id;
        book.addrETH = msg.sender;
        book.addrFIL = input.addrFIL;
        book.amtETH = msg.value;
        book.amtFIL = 100000; // TODO - reset to 0 in production
        book.valueFIL = 0; // value in ETH
        book.isAvailable = true;
        book.state = msg.value > 0 ? State.AVAILABLE : State.EMPTY;
        return book;
    }

    function setColBook(string memory id, string memory addrFIL)
        public
        payable
    {
        require(!colMap[msg.sender].isAvailable, 'user already exists'); // one-time
        ColInput memory input = ColInput(id, addrFIL);
        ColBook memory newBook = inputToBook(input);
        colMap[msg.sender] = newBook;
        users.push(msg.sender);
        emit SetColBook(msg.sender);
    }

    function upSizeETH() public payable {
        require(colMap[msg.sender].isAvailable == true, 'user not found');
        // TODO - check collateral coverage
        colMap[msg.sender].amtETH += msg.value;
        emit UpSizeETH(msg.sender);
    }

    function upSizeFIL(uint256 amtFIL) public payable {
        require(colMap[msg.sender].isAvailable == true, 'user not found');
        // TODO - check FIL network
        colMap[msg.sender].amtFIL += amtFIL;
        colMap[msg.sender].state = State.AVAILABLE;
        emit UpSizeFIL(msg.sender);
    }

    // to be called from market maker
    function delColBook() public {
        require(colMap[msg.sender].isAvailable == true, 'user not found');
        uint256 amtETH = colMap[msg.sender].amtETH;
        uint256 amtFIL = colMap[msg.sender].amtFIL;
        delete colMap[msg.sender]; // avoid reentrancy
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == msg.sender) delete users[i];
        } // users.length no change
        msg.sender.transfer(amtETH);
        amtFIL; // TODO - return FIL
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

    function getCoverageALL(uint256 amt, address addr)
        public
        view
        returns (uint256)
    {
        return (PCT * amt) / (colMap[addr].amtETH + colMap[addr].valueFIL);
    }

    // helper to get fx mid rate for valuation
    function getFILETH() public view returns (uint256) {
        uint256[1] memory rates = fxMarket.getMidRates();
        return rates[uint256(CcyPair.FILETH)];
    }

    // to be called relularly
    function updateValueFIL() public {
        uint256 fxRate = getFILETH();
        for (uint256 i = 0; i < users.length; i++) {
            colMap[users[i]].valueFIL =
                (colMap[users[i]].amtFIL * fxRate) / FXMULT;
        }
    }

    // to be called by market makers
    function requestFILCustodyAddr() public {
        emit RequestFILCustodyAddr(msg.sender);
    }

    // to be called by whitelisted scheduler
    function registerFILCustodyAddr(string memory addrFIL, address requester)
        public
    {
        require(colMap[requester].isAvailable == true);
        colMap[requester].custodyAddrFIL = addrFIL;
        emit RegisterFILCustodyAddr(requester);
    }

    // helper to check empty string
    function isEmptyStr(string memory str) private pure returns (bool) {
        bytes memory byteStr = bytes(str);
        return byteStr.length == 0;
    }

    function getAllFILCustodyAddr() public view returns (string[] memory) {
        string[] memory addrList = new string[](users.length);
        uint256 j = 0;
        for (uint256 i = 0; i < users.length; i++) {
            string memory addrFIL = colMap[users[i]].custodyAddrFIL;
            if (!isEmptyStr(addrFIL)) addrList[j++] = addrFIL;
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
        returns (string memory)
    {
        string[] memory addrList = getAllFILCustodyAddr();
        uint256 rand = getRandom(users.length + seed) % addrList.length;
        if (isEqualStr(addrList[rand], colMap[msg.sender].custodyAddrFIL))
            return getRandFILCustodyAddr(seed + 1); // avoid verify balance myself
        return addrList[rand];
    }
}
