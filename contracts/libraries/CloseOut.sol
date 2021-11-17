// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "hardhat/console.sol";

library CloseOut {
    using SafeMath for uint256;
    // TODO: Integrate address packing library directly with close out too perform counterparty checks

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
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the close out
    */
    function get(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        bytes32 addr,
        bytes32 ccy
    ) internal view returns (CloseOut.Payment storage payment) {
        payment = self[addr][ccy];
    }

    /** 
    * @dev Adds payments into the close out with provided information
    * @param self The mapping with all close out netting payments
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the close out
    * @param payment0 New payment obligated to the first counterparty
    * @param payment1 New payment obligated to the second counterparty
    * @return Boolean wether close out net amount was flipped during the update, if close out is flipped the net payment obligated to the second party and vice versa
    */
    function addPayments(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        bytes32 addr,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) internal returns (bool) {
        CloseOut.Payment storage closeOut = self[addr][ccy];

        if (closeOut.flipped) {
            if (payment0 > closeOut.netPayment && payment1 < payment0) {
                closeOut.netPayment = payment0.sub(closeOut.netPayment.add(payment1));
                closeOut.flipped = false;
            } else {
                closeOut.netPayment = closeOut.netPayment.add(payment1).sub(payment0);
            }
        } else {
            if (payment1 > closeOut.netPayment && payment0 < payment1) {
                closeOut.netPayment = payment1.sub(closeOut.netPayment.add(payment0));
                closeOut.flipped = true;
            } else {
                closeOut.netPayment = closeOut.netPayment.add(payment0).sub(payment1);
            }
        }

        return closeOut.flipped;
    }

    /** 
    * @dev Removes payments from the close out with provided information
    * @param self The mapping with all close out netting payments
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the close out
    * @param payment0 Payment to remove for the first counterparty
    * @param payment1 Payment to remove for the second counterparty
    * @return Boolean wether close out net amount was flipped during the update, if close out is flipped the net payment obligated to the second party and vice versa
    */
    function removePayments(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        bytes32 addr,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) internal returns (bool) {
        CloseOut.Payment storage closeOut = self[addr][ccy];
        uint256 paymentDelta = payment0 > payment1 ? payment0.sub(payment1) : payment1.sub(payment0);
        bool substraction;
        console.log('closeOut.flipped before is ', closeOut.flipped);
        console.log('closeOut.netPayment before is ', closeOut.netPayment);

        console.log('payment0 is ', payment0);
        console.log('payment1 is ', payment1);

        if (closeOut.flipped) {
            substraction = payment0 >= payment1 ? false : true;
        } else {
            substraction = payment0 >= payment1 ? true : false;
        }

        console.log('substraction is ', substraction);
        console.log('paymentDelta is ', paymentDelta);
        console.log('closeOut.netPayment is ', closeOut.netPayment);

        if (paymentDelta >= closeOut.netPayment) {
            console.log('paymentDelta  >= closeOut.netPayment is ', paymentDelta >= closeOut.netPayment);

            closeOut.netPayment = substraction ? paymentDelta.sub(closeOut.netPayment) : closeOut.netPayment.add(paymentDelta);
            closeOut.flipped = !closeOut.flipped;
            console.log('closee out flippeed 1 ');
        } else {
            closeOut.netPayment = substraction ? closeOut.netPayment.sub(paymentDelta) : closeOut.netPayment.add(paymentDelta);
        }
        console.log('closeOut.flipped after is ', closeOut.flipped);
        console.log('closeOut.netPayment after is ', closeOut.netPayment);

        return closeOut.flipped;
    }

    /**
    * @dev Closes the close out payment if both parties don't have any trading activities anymore
    * @param self The mapping with all close out netting payments
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the close out
    */
    function close(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        bytes32 addr,
        bytes32 ccy
    ) internal {
        CloseOut.Payment storage closeOut = self[addr][ccy];

        closeOut.closed = true;
    }

    /** 
    * @dev Clears the state of close out payment
    * @param self The mapping with all close out netting payments
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the close out
    */
    function clear(
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) storage self,
        bytes32 addr,
        bytes32 ccy
    ) internal {
        delete self[addr][ccy];
    }

}