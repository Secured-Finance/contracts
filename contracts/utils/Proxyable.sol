// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/StorageSlot.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

abstract contract Proxyable is Initializable {
    bytes32 internal constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    modifier onlyProxy() {
        require(_getImplementation() != address(0), "Must be called from proxy contract");
        _;
    }

    function _getImplementation() private view returns (address) {
        return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
    }
}
