// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

contract Collateral {
    event Registration(address indexed sender);

    enum State {EMPTY, NEW, IN_USE, MARGINCALL, LIQUIDATION}

    uint256 constant PCT = 100;

    struct UserItem {
        string id; // DID, email
        address addrETH;
        string addrFIL;
        uint256 amtETH;
        uint256 amtFIL;
        uint256 valueFIL; // evaluated in ETH
        bool isAvailable;
        State state;
    }

    struct UserInput {
        string id;
        string addrFIL;
    }

    mapping(address => UserItem) private userMap;
    address[] private users;

    function inputToItem(UserInput memory input)
        private
        view
        returns (UserItem memory)
    {
        UserItem memory item;
        item.id = input.id;
        item.addrETH = msg.sender;
        item.addrFIL = input.addrFIL;
        item.amtETH = 500; // TODO - reset to 0 in production
        item.amtFIL = 100000;
        item.valueFIL = 500;
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
        for (uint256 i = 0; i < users.length; i++) {
            allUsers[i] = userMap[users[i]];
        }
        return allUsers;
    }

    function getCoverageETH(uint256 amt, address addr)
        public
        view
        returns (uint256)
    {
        return (PCT * amt) / userMap[addr].amtETH;
    }

    function getCoverageFIL(uint256 amt, address addr)
        public
        view
        returns (uint256)
    {
        // TODO - get FILETH from FXMarket contract
        return (PCT * amt) / userMap[addr].valueFIL;
    }
}
