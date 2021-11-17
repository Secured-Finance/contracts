// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

library DealId {

    /**
    * @dev Generates a deal id using a product prefix and deal number
    * @param prefix Product type prefix in bytes4
    * @param counter Number of deal to be generated
    * @return id in bytes32 with prefix on the left and counter on the right side
    */
    function generate(bytes32 prefix, uint256 counter) public pure returns (bytes32 id) {
        uint224 num = toUint224(counter);
        bytes4 r;
        bytes32 zero = 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000;
        assembly {
            r := and(prefix, zero)
            id := add(r, num)
        }
    }

    /**
    * @dev Returns product based prefix from deal id
    * @param id Deal unique identification string
    * @return prefix in bytes4
    */
    function getPrefix(bytes32 id) public pure returns (bytes4 prefix) {
        assembly {
            prefix := shl(0, id)
        }
    }

    /**
    * @dev Returns converted number from uint256 to uint224
    */
    function toUint224(uint256 value) internal pure returns (uint224) {
        require(value <= type(uint224).max, "NUMBER_OVERFLOW");
        return uint224(value);
    }

}