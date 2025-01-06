// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IWPFIL {
    function getPFILByWPFIL(uint256 _wpFILAmount) external view returns (uint256);
}
