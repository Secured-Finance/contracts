// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// interfaces
import {IZCToken} from "./interfaces/IZCToken.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
import {ERC20PermitUpgradeable} from "./utils/ERC20PermitUpgradeable.sol";
// storage
import {ZCTokenStorage as Storage} from "./storages/ZCTokenStorage.sol";

/**
 * @notice Implements a token that represents zero-coupon bonds.
 */
contract ZCToken is IZCToken, MixinAddressResolver, ERC20PermitUpgradeable, Proxyable {
    /**
     * @notice Initializes the contract.
     * @param _resolver The address resolver to be used.
     * @param _name The name of the token
     * @param _symbol The symbol of the token
     * @param _asset The address of the token's underlying asset
     * @param _maturity The maturity of the token
     */
    function initialize(
        address _resolver,
        string memory _name,
        string memory _symbol,
        address _asset,
        uint256 _maturity
    ) external initializer onlyBeacon {
        Storage.slot().asset = _asset;
        Storage.slot().maturity = _maturity;

        registerAddressResolver(_resolver);
        __ERC20_initialize(_name, _symbol);
        __ERC20Permit_initialize(_name);

        buildCache();
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets the address of the token's underlying asset
     * @return The address of the token's underlying asset
     */
    function asset() external view override returns (address) {
        return Storage.slot().asset;
    }

    /**
     * @notice Gets the maturity of the token
     * @return The maturity of the token
     */
    function maturity() external view override returns (uint256) {
        return Storage.slot().maturity;
    }

    /**
     * @notice Mints new tokens
     * @param to The address to receive the new tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyLendingMarketController {
        _mint(to, amount);
    }

    /**
     * @notice Burns tokens
     * @param from The address to burn the tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyLendingMarketController {
        _burn(from, amount);
    }
}
