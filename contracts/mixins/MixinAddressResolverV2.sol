// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/Contracts.sol";
import "../interfaces/IAddressResolver.sol";
import "../interfaces/ICloseOutNetting.sol";
import "../interfaces/ICollateralAggregatorV3.sol";
import "../interfaces/ICollateralVaultV2.sol";
import "../interfaces/ICrosschainAddressResolver.sol";
import "../interfaces/ICurrencyController.sol";
import "../interfaces/IMarkToMarket.sol";
import "../interfaces/ILendingMarketControllerV2.sol";
import "../interfaces/ILiquidations.sol";
import "../interfaces/IPaymentAggregator.sol";
import "../interfaces/IProductAddressResolver.sol";
import "../interfaces/ISettlementEngine.sol";
import "../interfaces/ITermStructure.sol";

contract MixinAddressResolverV2 {
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

    function closeOutNetting() internal view returns (ICloseOutNetting) {
        return ICloseOutNetting(getAddress(Contracts.CLOSE_OUT_NETTING));
    }

    function collateralAggregator() internal view returns (ICollateralAggregatorV3) {
        return ICollateralAggregatorV3(getAddress(Contracts.COLLATERAL_AGGREGATOR));
    }

    function collateralVault() internal view returns (ICollateralVaultV2) {
        return ICollateralVaultV2(getAddress(Contracts.COLLATERAL_VAULT));
    }

    function crosschainAddressResolver() internal view returns (ICrosschainAddressResolver) {
        return ICrosschainAddressResolver(getAddress(Contracts.CROSSCHAIN_ADDRESS_RESOLVER));
    }

    function currencyController() internal view returns (ICurrencyController) {
        return ICurrencyController(getAddress(Contracts.CURRENCY_CONTROLLER));
    }

    function markToMarket() internal view returns (IMarkToMarket) {
        return IMarkToMarket(getAddress(Contracts.MARK_TO_MARKET));
    }

    function lendingMarketController() internal view returns (ILendingMarketControllerV2) {
        return ILendingMarketControllerV2(getAddress(Contracts.LENDING_MARKET_CONTROLLER));
    }

    function liquidations() internal view returns (ILiquidations) {
        return ILiquidations(getAddress(Contracts.LIQUIDATIONS));
    }

    function paymentAggregator() internal view returns (IPaymentAggregator) {
        return IPaymentAggregator(getAddress(Contracts.PAYMENT_AGGREGATOR));
    }

    function productAddressResolver() internal view returns (IProductAddressResolver) {
        return IProductAddressResolver(getAddress(Contracts.PRODUCT_ADDRESS_RESOLVER));
    }

    function settlementEngine() internal view returns (ISettlementEngine) {
        return ISettlementEngine(getAddress(Contracts.SETTLEMENT_ENGINE));
    }

    function termStructure() internal view returns (ITermStructure) {
        return ITermStructure(getAddress(Contracts.TERM_STRUCTURE));
    }
}