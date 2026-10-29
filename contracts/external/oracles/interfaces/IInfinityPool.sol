// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IInfinityPool {
    /**
     * @notice Converts an asset amount into the corresponding pool share amount.
     * @param assets The amount of assets
     * @return The corresponding amount of shares
     */
    function convertToShares(uint256 assets) external view returns (uint256);

    /**
     * @notice Converts a pool share amount into the corresponding asset amount.
     * @param shares The amount of shares
     * @return The corresponding amount of assets
     */
    function convertToAssets(uint256 shares) external view returns (uint256);

    /**
     * @notice Redeems pool shares for their underlying assets.
     * @param shares The amount of shares to redeem
     * @param receiver The address receiving the underlying assets
     * @param owner The address owning the shares
     * @return assets The amount of assets redeemed
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);
}
