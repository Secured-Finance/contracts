// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

library AddressPacking {

    /**
    * @dev Packs two addresses into one hash to reduce the number of arguments
    * @param addr0 First address
    * @param addr1 Second address
    * @return Boolean to identify if addresses were flipped
    */
    function pack(address addr0, address addr1) internal pure returns (bytes32, bool) {
        require(addr0 != address(0), 'Invalid address');
        require(addr0 != addr1, 'Identical addresses');

        if (addr0 < addr1) {
            return (keccak256(abi.encode(addr0, addr1)), false);
        } else {
            return (keccak256(abi.encode(addr1, addr0)), true);
        }
    }
}