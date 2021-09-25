// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;

import '../libraries/AddressPacking.sol';

contract AddressPackingTest {
    
    function pack(
        address party0,
        address party1
    ) external pure returns (bytes32, bool) {
        return AddressPacking.pack(party0, party1);
    }

    function getGasCostOfPack(
        address party0,
        address party1
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        AddressPacking.pack(party0, party1);

        return gasBefore - gasleft();
    }
}
