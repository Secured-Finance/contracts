// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../libraries/DealId.sol";
import "../libraries/ProductPrefixes.sol";

contract DealIdTest {
    function generate(uint256 number) external pure returns (bytes32 id) {
        id = DealId.generate(ProductPrefixes.LOAN, number);
    }

    function getGasCostOfGenerate(uint256 number) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        DealId.generate(ProductPrefixes.LOAN, number);

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
