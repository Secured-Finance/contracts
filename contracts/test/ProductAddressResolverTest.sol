// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../ProductAddressResolver.sol";

contract ProductAddressResolverTest is ProductAddressResolver {
    function getGasCostOfGetProductContract(bytes4 _prefix) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        getProductContract(_prefix);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetControllerContract(bytes4 _prefix) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        getControllerContract(_prefix);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetProductContractWithTypeConversion(bytes32 _dealID)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        bytes4 _prefix;

        assembly {
            _prefix := shl(0, _dealID)
        }

        getProductContract(_prefix);
        return gasBefore - gasleft();
    }

    function getGasCostOfGetControllerContractWithTypeConversion(bytes32 _dealID)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        bytes4 _prefix;
        assembly {
            _prefix := shr(0, _dealID)
        }

        getControllerContract(_prefix);
        return gasBefore - gasleft();
    }
}
