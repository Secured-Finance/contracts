// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IInfinityPool {
    function convertToShares(uint256 assets) external view returns (uint256);

    function convertToAssets(uint256 shares) external view returns (uint256);
}
