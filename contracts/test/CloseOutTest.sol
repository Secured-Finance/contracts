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

    function get(
        address party0,
        address party1
    ) external view returns (CloseOut.Payment memory payment) {
        payment = CloseOut.get(_closeOuts, party0, party1, ccy);
    }

    function addPayments(
        address party0,
        address party1,
        uint256 payment0,
        uint256 payment1
    ) external {
        CloseOut.addPayments(_closeOuts, party0, party1, ccy, payment0, payment1);
    }
    
    function removePayments(
        address party0,
        address party1,
        uint256 payment0,
        uint256 payment1
    ) external {
        CloseOut.removePayments(_closeOuts, party0, party1, ccy, payment0, payment1);
    }

    function close(
        address party0,
        address party1
    ) external {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        CloseOut.close(_closeOuts, party0, party1, ccy);
        require(_closeOuts[packedAddrs][ccy].closed == true, "PAYMENTS NOT SETTLED");
    }

    function clear(
        address party0,
        address party1
    ) external {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        CloseOut.clear(_closeOuts, party0, party1, ccy);
        require(_closeOuts[packedAddrs][ccy].netPayment == 0, "PAYMENTS NOT CLEARED");
    }

}