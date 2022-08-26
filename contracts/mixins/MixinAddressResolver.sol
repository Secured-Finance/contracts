// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/Contracts.sol";
import "../interfaces/IAddressResolver.sol";
import "../interfaces/ICollateralAggregator.sol";
import "../interfaces/ICollateralVault.sol";
import "../interfaces/ICurrencyController.sol";
import "../interfaces/ILendingMarketController.sol";

contract MixinAddressResolver {
    event CacheUpdated(bytes32 name, address destination);

    IAddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    modifier onlyAcceptedContracts() {
        require(isAcceptedContract(msg.sender), "Only Accepted Contracts");
        _;
    }

    /**
     * @dev Returns required contract names in this contract
     */
    function requiredContracts() public pure virtual returns (bytes32[] memory contracts) {}

    /**
     * @dev Returns contract names that can call this contract.
     */
    function acceptedContracts() public pure virtual returns (bytes32[] memory contracts) {}

    function buildCache() public {
        // The resolver must call this function whenever it updates its state
        bytes32[] memory contractNames = requiredContracts();
        for (uint256 i = 0; i < contractNames.length; i++) {
            bytes32 name = contractNames[i];
            // Note: can only be invoked once the resolver has all the targets needed added
            address destination = resolver.getAddress(
                name,
                string(abi.encodePacked("Resolver missing target: ", name))
            );
            addressCache[name] = destination;
            emit CacheUpdated(name, destination);
        }
    }

    function isResolverCached() external view returns (bool) {
        bytes32[] memory contractNames = requiredContracts();
        for (uint256 i = 0; i < contractNames.length; i++) {
            bytes32 name = contractNames[i];
            // false if our cache is invalid or if the resolver doesn't have the required address
            if (
                resolver.getAddress(name) != addressCache[name] || addressCache[name] == address(0)
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Register the Address Resolver contract
     * @param _resolver The address of the Address Resolver contract
     */
    function registerAddressResolver(address _resolver) internal {
        require(address(resolver) == address(0), "resolver registered already");
        resolver = IAddressResolver(_resolver);
    }

    function getAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), string(abi.encodePacked("Missing address: ", name)));
        return _foundAddress;
    }

    function isAcceptedContract(address account) internal view virtual returns (bool) {
        bytes32[] memory contractNames = acceptedContracts();
        for (uint256 i = 0; i < contractNames.length; i++) {
            if (account == getAddress(contractNames[i])) {
                return true;
            }
        }

        return false;
    }

    function collateralAggregator() internal view returns (ICollateralAggregator) {
        return ICollateralAggregator(getAddress(Contracts.COLLATERAL_AGGREGATOR));
    }

    function collateralVault() internal view returns (ICollateralVault) {
        return ICollateralVault(getAddress(Contracts.COLLATERAL_VAULT));
    }

    function currencyController() internal view returns (ICurrencyController) {
        return ICurrencyController(getAddress(Contracts.CURRENCY_CONTROLLER));
    }

    function lendingMarketController() internal view returns (ILendingMarketController) {
        return ILendingMarketController(getAddress(Contracts.LENDING_MARKET_CONTROLLER));
    }
}
