// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";
import "../interfaces/IPaymentAggregator.sol";

contract PaymentAggregatorCallerMock is ProtocolTypes {
    
    IPaymentAggregator public paymentAggregator;

    constructor(address _paymentAggregator) public {
        paymentAggregator = IPaymentAggregator(_paymentAggregator);
    }

    function registerPayments(
        address party0,
        address party1,
        bytes32 ccy,
        Term term,
        uint256 notional,
        uint256 rate0,
        uint256 rate1,
        bool repayment0,
        bool repayment1
    ) public {
        paymentAggregator.registerPayments(party0, party1, ccy, uint8(term), notional, rate0, rate1, repayment0, repayment1);
    }

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 startDate,
        Term term,
        uint256 notional,
        uint256 rate0,
        uint256 rate1,
        bool repayment0,
        bool repayment1
    ) public {
        paymentAggregator.removePayments(party0, party1, ccy, startDate, uint8(term), notional, rate0, rate1, repayment0, repayment1);
    }

    function verifyPayment(
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        uint256 payment,
        bytes32 txHash
    ) public {
        paymentAggregator.verifyPayment(msg.sender, counterparty, ccy, timestamp, payment, txHash);
    }

    function settlePayment(
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        bytes32 txHash
    ) public {
        paymentAggregator.settlePayment(msg.sender, counterparty, ccy, timestamp, txHash);
    }

}