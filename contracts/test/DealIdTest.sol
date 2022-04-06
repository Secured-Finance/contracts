// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;

import "../libraries/DealId.sol";

contract DealIdTest {
    bytes4 sample_prefix = 0x21aaa47b;

    function generate(uint256 number) external view returns (bytes32 id) {
        id = DealId.generate(sample_prefix, number);
    }

    function getGasCostOfGenerate(uint256 number)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        DealId.generate(sample_prefix, number);

        return gasBefore - gasleft();
    }

    function getPrefix(bytes32 id) external pure returns (bytes4 prefix) {
        prefix = DealId.getPrefix(id);
    }

    function getGasCostOfGetPrefix(bytes32 id) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        DealId.getPrefix(id);

        return gasBefore - gasleft();
    }
}
