// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../libraries/AddressPacking.sol";
import "../libraries/CloseOut.sol";

contract CloseOutTest {
    using SafeMath for uint256;

    mapping(bytes32 => mapping (bytes32 => CloseOut.Payment)) _closeOuts;
    bytes32 ccy = "0xSampleCCY";

    function get(bytes32 addrPack) external view returns (CloseOut.Payment memory payment) {
        payment = CloseOut.get(_closeOuts, addrPack, ccy);
    }

    function addPayments(
        bytes32 addrPack,
        uint256 payment0,
        uint256 payment1
    ) external {
        CloseOut.addPayments(_closeOuts, addrPack, ccy, payment0, payment1);
    }
    
    function removePayments(
        bytes32 addrPack,
        uint256 payment0,
        uint256 payment1
    ) external {
        CloseOut.removePayments(_closeOuts, addrPack, ccy, payment0, payment1);
    }

    function close(bytes32 addrPack, bytes32 txHash) external {
        CloseOut.close(_closeOuts, addrPack, ccy, txHash);
        require(_closeOuts[addrPack][ccy].paymentProof == txHash, "PAYMENTS NOT SETTLED");
    }

    function clear(bytes32 addrPack) external {
        CloseOut.clear(_closeOuts, addrPack, ccy);
        require(_closeOuts[addrPack][ccy].netPayment == 0, "PAYMENTS NOT CLEARED");
    }

}