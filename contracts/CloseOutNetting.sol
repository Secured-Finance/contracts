// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./ProtocolTypes.sol";
import "./libraries/CloseOut.sol";
import "./libraries/AddressPacking.sol";
import "./interfaces/ICollateralAggregator.sol";

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

    event UpdatePaymentAggregator(address indexed prevAddr, address indexed addr);
    event UpdateCollateralAggregator(address indexed prevAddr, address indexed addr);

    event AddCloseOutPayments(address indexed party0, address indexed party1, bytes32 ccy, uint256 payment0, uint256 payment1);
    event RemoveCloseOutPayments(address indexed party0, address indexed party1, bytes32 ccy, uint256 payment0, uint256 payment1);
    event VerifyCloseOut(address indexed party0, address indexed party1, bytes32 ccy, uint256 netPayment, bytes32 txHash);
    event SettleCloseOut(address indexed party0, address indexed party1, bytes32 ccy, uint256 netPayment, bytes32 txHash);

    address public owner;

    // Linked contract addresses
    ICollateralAggregator private collateralAggregator;
    address private paymentAggregator;

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
    * @dev Modifier to make a function callable only by payment aggregator contract.
    */
    modifier onlyPaymentAggregator() {
        require(msg.sender == paymentAggregator);
        _;
    }

    /**
    * @dev Modifier to make a function callable only by passing contract address checks.
    */
    modifier onlyContractAddr(address addr) {
        require(addr != address(0), "INVALID_ADDRESS");
        require(addr.isContract(), "NOT_CONTRACT");
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
    * @dev Contract constructor function.
    * @notice sets contract deployer as owner of this contract
    * @param _paymentAggregator PaymentAggregator contract address
    */
    constructor(address _paymentAggregator) public {
        owner = msg.sender;
        paymentAggregator = _paymentAggregator;
        // collateralAggregator = ICollateralAggregator(_collateralAggregator);
    }

    /**
    * @dev Trigers to update Payment Aggregator contract address
    * @param addr New PaymentAggregator contract address
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving 0x0 address or non contract address
    */
    function updatePaymentAggregator(address addr) public onlyOwner onlyContractAddr(addr) {
        emit UpdatePaymentAggregator(paymentAggregator, addr);
        paymentAggregator = addr;
    }

    /**
    * @dev Trigers to update Collateral Aggregator contract address
    * @param addr New CollateralAggregator contract address
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving 0x0 address or non contract address
    */
    function updateCollateralAggregator(address addr) public onlyOwner onlyContractAddr(addr) {
        address prevAddr = address(collateralAggregator);

        emit UpdateCollateralAggregator(prevAddr, addr);
        collateralAggregator = ICollateralAggregator(addr);
    }

    /**
    * @dev Returns the close out payment between two counterparties
    * @param party0 First counterparty address
    * @param party1 Second counterparty address
    * @param ccy Main payment settlement currency
    */
    function getCloseOutPayment(
        address party0,
        address party1,
        bytes32 ccy
    ) public view returns (CloseOut.Payment memory payment) {
        payment = CloseOut.get(_closeOuts, party0, party1, ccy);
    }

    /**
    * @dev Triggers to add total payments during the registration of the deal in close out netting
    * @param party0 First counterparty address
    * @param party1 Second counterparty address
    * @param ccy Main settlement currency of the deal
    * @param payment0 Aggregated payment for first counterparty
    * @param payment1 Aggregated payment for second counterparty
    *
    * @notice Executed only be PaymentAggregator contract
    */
    function addPayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external onlyPaymentAggregator {
        CloseOut.addPayments(_closeOuts, party0, party1, ccy, payment0, payment1);

        emit AddCloseOutPayments(party0, party1, ccy, payment0, payment1);
    }

    /**
    * @dev Triggers to remove aggregated payments during the liquidation of the deal in close out netting
    * @param party0 First counterparty address
    * @param party1 Second counterparty address
    * @param ccy Main settlement currency of the deal
    * @param payment0 Aggregated payment for first counterparty
    * @param payment1 Aggregated payment for second counterparty
    *
    * @notice Executed only be PaymentAggregator contract
    */
    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external onlyPaymentAggregator {
        CloseOut.removePayments(_closeOuts, party0, party1, ccy, payment0, payment1);

        emit RemoveCloseOutPayments(party0, party1, ccy, payment0, payment1);
    }

    /**
    * @dev External function to check if `_party` is in default
    */
    function checkDefault(address _party) external view returns (bool) {
        return _isDefaulted[_party];
    }

    /**
    * @dev Internal function to declare default for `_defaultedParty`
    */
    function _handleDefault(address _defaultedParty) internal {
        _isDefaulted[_defaultedParty] = true;
    }

    /**
    * @dev Internal function to execute close out netting payment
    * liquidates ETH from party's collateral with bigger net payment to their counterparty
    * @notice Only triggers if one of the counterparties in default
    */
    function _handleCloseOut(
        address party0,
        address party1
    ) internal  {
        require(_isDefaulted[party0] || _isDefaulted[party1], "NON_DEFAULTED_PARTIES");
        bytes32[] memory currencies = collateralAggregator.getExposedCurrencies(party0, party1);

        for (uint256 i = 0; i < currencies.length; i++) {
            bytes32 ccy = currencies[i];

            CloseOut.Payment memory payment = CloseOut.get(_closeOuts, party0, party1, ccy);

            if (payment.flipped) {
                collateralAggregator.liquidate(party1, party0, ccy, payment.netPayment);
            } else {
                collateralAggregator.liquidate(party0, party1, ccy, payment.netPayment);
            }

            CloseOut.close(_closeOuts, party0, party1, ccy);
        }
    }

}
