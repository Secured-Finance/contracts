// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./AddressPacking.sol";

library CloseOut {
    using SafeMath for uint256;

    /**
     * @dev Payment keeps track of net payment for close out netting
     * and an indicator if party's obligations are flipped
     */
    struct Payment {
        uint256 netPayment;
        bool flipped;
        bool closed;
    }

    /**
     * @dev Returns the close out payment between 2 counterparties
     * @param self The mapping with all close out netting payments
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main currency for the close out
     */
    function get(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        address party0,
        address party1,
        bytes32 ccy
    ) internal view returns (CloseOut.Payment memory payment) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(party0, party1);
        payment = self[packedAddrs][ccy];

        flipped ? payment.flipped = !payment.flipped : payment.flipped = payment.flipped;
    }

    struct CloseOutLocalVars {
        bytes32 packedAddrs;
        bool flipped;
        uint256 payment0;
        uint256 payment1;
    }

    /**
     * @dev Adds payments into the close out with provided information
     * @param self The mapping with all close out netting payments
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main currency for the close out
     * @param payment0 New payment obligated to the first counterparty
     * @param payment1 New payment obligated to the second counterparty
     * @return Boolean wether close out net amount was flipped during the update, if close out is flipped the net payment obligated to the second party and vice versa
     */
    function addPayments(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) internal returns (bool) {
        CloseOutLocalVars memory vars;
        (vars.packedAddrs, vars.flipped) = AddressPacking.pack(party0, party1);

        if (vars.flipped) {
            vars.payment0 = payment1;
            vars.payment1 = payment0;
        } else {
            vars.payment0 = payment0;
            vars.payment1 = payment1;
        }

        CloseOut.Payment storage closeOut = self[vars.packedAddrs][ccy];

        if (closeOut.flipped) {
            if (vars.payment0 > closeOut.netPayment && vars.payment1 < vars.payment0) {
                closeOut.netPayment = vars.payment0.sub(closeOut.netPayment.add(vars.payment1));
                closeOut.flipped = false;
            } else {
                closeOut.netPayment = closeOut.netPayment.add(vars.payment1).sub(vars.payment0);
            }
        } else {
            if (vars.payment1 > closeOut.netPayment && vars.payment0 < vars.payment1) {
                closeOut.netPayment = vars.payment1.sub(closeOut.netPayment.add(vars.payment0));
                closeOut.flipped = true;
            } else {
                closeOut.netPayment = closeOut.netPayment.add(vars.payment0).sub(vars.payment1);
            }
        }

        return closeOut.flipped;
    }

    /**
     * @dev Removes payments from the close out with provided information
     * @param self The mapping with all close out netting payments
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main currency for the close out
     * @param payment0 Payment to remove for the first counterparty
     * @param payment1 Payment to remove for the second counterparty
     * @return Boolean wether close out net amount was flipped during the update, if close out is flipped the net payment obligated to the second party and vice versa
     */
    function removePayments(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) internal returns (bool) {
        CloseOutLocalVars memory vars;
        (vars.packedAddrs, vars.flipped) = AddressPacking.pack(party0, party1);

        if (vars.flipped) {
            vars.payment0 = payment1;
            vars.payment1 = payment0;
        } else {
            vars.payment0 = payment0;
            vars.payment1 = payment1;
        }

        CloseOut.Payment storage closeOut = self[vars.packedAddrs][ccy];
        uint256 paymentDelta = vars.payment0 > vars.payment1
            ? vars.payment0.sub(vars.payment1)
            : vars.payment1.sub(vars.payment0);
        bool substraction;

        if (closeOut.flipped) {
            substraction = vars.payment0 >= vars.payment1 ? false : true;
        } else {
            substraction = vars.payment0 >= vars.payment1 ? true : false;
        }

        if (paymentDelta >= closeOut.netPayment && substraction) {
            closeOut.netPayment = paymentDelta.sub(closeOut.netPayment);
            closeOut.flipped = !closeOut.flipped;
        } else {
            closeOut.netPayment = substraction
                ? closeOut.netPayment.sub(paymentDelta)
                : closeOut.netPayment.add(paymentDelta);
        }

        return closeOut.flipped;
    }

    /**
     * @dev Closes the close out payment if both parties don't have any trading activities anymore
     * @param self The mapping with all close out netting payments
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main currency for the close out
     */
    function close(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        address party0,
        address party1,
        bytes32 ccy
    ) internal {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        CloseOut.Payment storage closeOut = self[packedAddrs][ccy];

        closeOut.closed = true;
    }

    /**
     * @dev Clears the state of close out payment
     * @param self The mapping with all close out netting payments
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main currency for the close out
     */
    function clear(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        address party0,
        address party1,
        bytes32 ccy
    ) internal {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        delete self[packedAddrs][ccy];
    }
}
