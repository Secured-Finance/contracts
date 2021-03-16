// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface OwnedInterface {
    function getOwner() external view returns(address owner);
    function changeOwner(address newOwner) external returns (bool success);
}

contract Owned is OwnedInterface {
    
    address private contractOwner;
  
    event LogOwnerChanged(
        address newOwner);

    modifier onlyOwner {
        require(msg.sender == contractOwner);
        _;
    } 
  
    constructor() public {
        contractOwner = msg.sender;
    }

    function getOwner() public view override returns(address owner) {
        return contractOwner;
    }
  
    function changeOwner(address newOwner) 
        public
        override
        onlyOwner 
        returns(bool success) 
    {
        require(newOwner != address(0));
        emit LogOwnerChanged(newOwner);
        contractOwner = newOwner;
        return true;
    }
}