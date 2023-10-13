// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMockERC20 {
    event AddressImported(bytes32 name, address destination);

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function setMinterRole(address account) external;

    function removeMinterRole(address account) external;
}
