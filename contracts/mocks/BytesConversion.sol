// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

contract BytesConversion {
    function getBytes32(string memory _product)
        external
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(_product));
    }

    function getGasCostOfGetBytes32(string memory _product)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        keccak256(abi.encode(_product));

        return gasBefore - gasleft();
    }

    function getBytes4(string memory _product) public view returns (bytes4 r) {
        bytes32 z = keccak256(abi.encode(_product));
        assembly {
            r := shl(0, z)
        }
    }

    function generateDealID(string memory _product, uint224 counter)
        public
        view
        returns (bytes32 id)
    {
        bytes32 z = keccak256(abi.encode(_product));
        bytes4 r;
        bytes32 zero = 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000;
        assembly {
            r := and(z, zero)
            id := add(r, counter)
        }
    }

    function getMaxValue() public view returns (uint224 value) {
        value = uint224(-1);
    }

    function getPrefix(bytes32 id) public view returns (bytes4 prefix) {
        assembly {
            prefix := shl(0, id)
        }
    }

    function getGasCostOfGetBytes4(string memory _product)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        bytes32 z = keccak256(abi.encode(_product));
        bytes4 r;
        assembly {
            r := shl(0, z)
        }

        return gasBefore - gasleft();
    }
}
