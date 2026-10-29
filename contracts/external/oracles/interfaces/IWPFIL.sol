// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IWPFIL {
    /**
     * @notice Gets the amount of pFIL represented by an amount of wpFIL.
     * @param _wpFILAmount The amount of wpFIL
     * @return The corresponding amount of pFIL
     */
    function getPFILByWPFIL(uint256 _wpFILAmount) external view returns (uint256);

    /**
     * @notice Unwraps wpFIL into pFIL and sends it to the caller.
     * @param _wpFILAmount The amount of wpFIL to unwrap
     * @return pFILAmount The amount of pFIL sent to the caller
     */
    function unwrap(uint256 _wpFILAmount) external returns (uint256 pFILAmount);
}
