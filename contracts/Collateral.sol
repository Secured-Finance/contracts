// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./Market.sol";

contract Collateral {

    event Registration(address indexed sender);

    enum CcyPair { FILETH }
    enum State { EMPTY, NEW, IN_USE, MARGINCALL, LIQUIDATION }

    uint constant PCT = 100;
    uint constant FXMULT = 1000;

    struct UserItem {
        string id; // DID, email
        address addrETH;
        string addrFIL;
        uint amtETH;
        uint amtFIL;
        uint valueFIL; // evaluated in ETH
        bool isAvailable;
        State state;
    }

    struct UserInput {
        string id;
        string addrFIL;
    }

    mapping(address => UserItem) private userMap;
    address[] private users;

    MoneyMarket moneyMarket;
    FXMarket fxMarket;

    function setMarketAddr(address moneyAddr, address fxAddr) public {
        moneyMarket = MoneyMarket(moneyAddr);
        fxMarket = FXMarket(fxAddr);
    }

    function inputToItem(UserInput memory input) private view returns (UserItem memory) {
        UserItem memory item;
        item.id = input.id;
        item.addrETH = msg.sender;
        item.addrFIL = input.addrFIL;
        item.amtETH = 500; // TODO - reset to 0 in production
        item.amtFIL = 100000;
        item.valueFIL = 500; // value in ETH
        item.isAvailable = true;
        item.state = State.EMPTY;
        return item;
    }

    function setUser(string memory id, string memory addrFIL) public {
        UserInput memory input = UserInput(id, addrFIL);
        UserItem memory newItem = inputToItem(input);
        userMap[msg.sender] = newItem;
        users.push(msg.sender);
        emit Registration(msg.sender);
    }

    function getOneUser(address addr) public view returns (UserItem memory) {
        return userMap[addr];
    }

    function getAllUsers() public view returns (address[] memory) {
        return users;
    }

    function getAllUserItems() public view returns (UserItem[] memory) {
        UserItem[] memory allUsers = new UserItem[](users.length);
        for (uint i = 0; i < users.length; i++) {
            allUsers[i] = userMap[users[i]];
        }
        return allUsers;
    }

    function getCoverageALL(uint amt, address addr) public view returns (uint) {
        return PCT * amt / (userMap[addr].amtETH + userMap[addr].valueFIL);
    }

    function updateValueFIL() public {
        uint fxRate = getFILETH();
        for (uint i = 0; i < users.length; i++) {
            userMap[users[i]].valueFIL = userMap[users[i]].amtFIL * fxRate / FXMULT;
        }
    }

    function getFILETH() public view returns (uint) {
        uint [1] memory rates = fxMarket.getMidRates();
        return rates[uint(CcyPair.FILETH)];
    }

}
