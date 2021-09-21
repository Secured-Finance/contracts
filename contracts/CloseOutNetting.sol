// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ProtocolTypes.sol";
import "./libraries/CloseOut.sol";
import "./libraries/AddressPacking.sol";

/**
 * @title Close Out Netting contract is used in close out operations  
 * Close out is the process while one of the counterparties declared 
 * as defaulted party and all deals should be terminated
 *
 * Contract linked to all product based contracts (ex. Loan, Swap, etc), and Collateral Aggregator contract.
 */
contract CloseOutNetting {
    using SafeMath for uint256;
    using Address for address;
    using CloseOut for CloseOut.Payment;
    using EnumerableSet for EnumerableSet.AddressSet;

    event UpdateCloseOut(address indexed party0, address indexed party1, bytes32 ccy, uint256 netPayment);
    event VerifyCloseOut(address indexed party0, address indexed party1, bytes32 ccy, uint256 netPayment, bytes32 txHash);
    event SettleCloseOut(address indexed party0, address indexed party1, bytes32 ccy, uint256 netPayment, bytes32 txHash);

    address public owner;

    // Linked contract addresses
    EnumerableSet.AddressSet private closeOutUsers;

    // Mapping structure for storing Close Out payments
    mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) _closeOuts;

    // Mapping structure for storing default boolean per address
    mapping(address => bool) _isDefaulted;

    /**
    * @dev Modifier to make a function callable only by contract owner.
    */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
    * @dev Modifier to make a function callable only by defaulted counterparty.
    */
    modifier defaultedParty() {
        require(_isDefaulted[msg.sender]);
        _;
    }

    /**
    * @dev Modifier to make a function callable only by non defaulted counterparty.
    */
    modifier nonDefaultedParty() {
        require(!_isDefaulted[msg.sender]);
        _;
    }

    /**
    * @dev Modifier to check if msg.sender is payment aggregator user
    */
    modifier acceptedContract() {
        require(closeOutUsers.contains(msg.sender), "not allowed to use close out netting");
        _;
    }

    /**
    * @dev Contract constructor function.
    * @notice sets contract deployer as owner of this contract
    */
    constructor() public {
        owner = msg.sender;
    }

}
