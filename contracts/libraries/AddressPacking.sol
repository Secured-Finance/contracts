// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

library AddressPacking {
    /**
     * @dev Packs two addresses into one hash to reduce the number of arguments
     * @param addr0 First address
     * @param addr1 Second address
     * @return Boolean to identify if addresses were flipped
     */
    function pack(address addr0, address addr1)
        internal
        pure
        returns (bytes32, bool)
    {
        require(addr0 != addr1, "Identical addresses");
        (address _addr0, address _addr1) = addr0 < addr1
            ? (addr0, addr1)
            : (addr1, addr0);
        require(_addr0 != address(0), "Invalid address");

        if (_addr0 != addr0) {
            return (keccak256(abi.encode(_addr0, _addr1)), true);
        } else {
            return (keccak256(abi.encode(_addr0, _addr1)), false);
        }
    }
}
