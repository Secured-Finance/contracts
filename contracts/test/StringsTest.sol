// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../libraries/Strings.sol";

contract StringsTest {
    function isEqual(string memory text0, string memory text1)
        external
        pure
        returns (bool)
    {
        return Strings.isEqual(text0, text1);
    }

    function toHex(bytes32 _hash) external pure returns (string memory) {
        return Strings.toHex(_hash);
    }

    function toHex16(bytes16 _halfOfHash) external pure returns (bytes32) {
        return Strings.toHex16(_halfOfHash);
    }

    function getGasCostOfIsEqual(string memory text0, string memory text1)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        Strings.isEqual(text0, text1);

        return gasBefore - gasleft();
    }

    function getGasCostOfToHex(bytes32 _hash) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        Strings.toHex(_hash);

        return gasBefore - gasleft();
    }

    function getGasCostOfToHex16(bytes16 _halfOfHash)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        Strings.toHex16(_halfOfHash);

        return gasBefore - gasleft();
    }
}
