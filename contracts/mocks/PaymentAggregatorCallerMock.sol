// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/IPaymentAggregator.sol";

contract PaymentAggregatorCallerMock {
    IPaymentAggregator public paymentAggregator;

    constructor(address _paymentAggregator) {
        paymentAggregator = IPaymentAggregator(_paymentAggregator);
    }

    function registerPayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[] memory timestamps,
        uint256[] memory payments0,
        uint256[] memory payments1
    ) public {
        paymentAggregator.registerPayments(
            party0,
            party1,
            ccy,
            dealId,
            timestamps,
            payments0,
            payments1
        );
    }

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[] calldata timestamps,
        uint256[] calldata payments0,
        uint256[] calldata payments1
    ) public {
        paymentAggregator.removePayments(
            party0,
            party1,
            ccy,
            dealId,
            timestamps,
            payments0,
            payments1
        );
    }

    function verifyPayment(
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        uint256 payment,
        bytes32 settlementId
    ) public {
        paymentAggregator.verifyPayment(
            msg.sender,
            counterparty,
            ccy,
            timestamp,
            payment,
            settlementId
        );
    }

    function isRegisteredProductContract(address _product) public pure returns (bool) {
        return address(_product) != address(0);
    }
}
