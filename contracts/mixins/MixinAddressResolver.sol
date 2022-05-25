// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../AddressResolver.sol";
import "../interfaces/ICloseOutNetting.sol";
import "../interfaces/ICollateralAggregatorV2.sol";
import "../interfaces/ICrosschainAddressResolver.sol";
import "../interfaces/ICurrencyController.sol";
import "../interfaces/IMarkToMarket.sol";
import "../interfaces/ILendingMarketController.sol";
import "../interfaces/ILiquidations.sol";
import "../interfaces/ILoanV2.sol";
import "../interfaces/IPaymentAggregator.sol";
import "../interfaces/IProductAddressResolver.sol";
import "../interfaces/ISettlementEngine.sol";
import "../interfaces/ITermStructure.sol";

contract MixinAddressResolver {
    event CacheUpdated(bytes32 name, address destination);

    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    bytes32 public constant CONTRACT_CLOSE_OUT_NETTING = "CloseOutNetting";
    bytes32 public constant CONTRACT_COLLATERAL_AGGREGATOR =
        "CollateralAggregator";
    bytes32 public constant CONTRACT_CROSSCHAIN_ADDRESS_RESOLVER =
        "CrosschainAddressResolver";
    bytes32 public constant CONTRACT_CURRENCY_CONTROLLER = "CurrencyController";
    bytes32 public constant CONTRACT_MARK_TO_MARKET = "MarkToMarket";
    bytes32 public constant CONTRACT_LENDING_MARKET_CONTROLLER =
        "LendingMarketController";
    bytes32 public constant CONTRACT_LIQUIDATIONS = "Liquidations";
    bytes32 public constant CONTRACT_LOAN = "Loan";
    bytes32 public constant CONTRACT_PAYMENT_AGGREGATOR = "PaymentAggregator";
    bytes32 public constant CONTRACT_PRODUCT_ADDRESS_RESOLVER =
        "ProductAddressResolver";
    bytes32 public constant CONTRACT_SETTLEMENT_ENGINE = "SettlementEngine";
    bytes32 public constant CONTRACT_TERM_STRUCTURE = "TermStructure";

    modifier onlyAcceptedContracts() {
        require(isAcceptedContract(msg.sender), "Only Accepted Contracts");
        _;
    }

    /**
     * @dev Constructor.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) public {
        resolver = AddressResolver(_resolver);
    }

    /**
     * @dev Returns required contract names in this contract
     */
    function requiredContracts()
        public
        view
        virtual
        returns (bytes32[] memory contracts)
    {}

    /**
     * @dev Returns contract names that can call this contract.
     */
    function acceptedContracts()
        public
        view
        virtual
        returns (bytes32[] memory contracts)
    {}

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
                resolver.getAddress(name) != addressCache[name] ||
                addressCache[name] == address(0)
            ) {
                return false;
            }
        }

        return true;
    }

    function getAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(
            _foundAddress != address(0),
            string(abi.encodePacked("Missing address: ", name))
        );
        return _foundAddress;
    }

    function isAcceptedContract(address account)
        internal
        view
        virtual
        returns (bool)
    {
        bytes32[] memory contractNames = acceptedContracts();
        for (uint256 i = 0; i < contractNames.length; i++) {
            if (account == getAddress(contractNames[i])) {
                return true;
            }
        }

        return false;
    }

    function closeOutNetting() internal view returns (ICloseOutNetting) {
        return ICloseOutNetting(getAddress(CONTRACT_CLOSE_OUT_NETTING));
    }

    function collateralAggregator()
        internal
        view
        returns (ICollateralAggregator)
    {
        return
            ICollateralAggregator(getAddress(CONTRACT_COLLATERAL_AGGREGATOR));
    }

    function crosschainAddressResolver()
        internal
        view
        returns (ICrosschainAddressResolver)
    {
        return
            ICrosschainAddressResolver(
                getAddress(CONTRACT_CROSSCHAIN_ADDRESS_RESOLVER)
            );
    }

    function currencyController() internal view returns (ICurrencyController) {
        return ICurrencyController(getAddress(CONTRACT_CURRENCY_CONTROLLER));
    }

    function markToMarket() internal view returns (IMarkToMarket) {
        return IMarkToMarket(getAddress(CONTRACT_MARK_TO_MARKET));
    }

    function lendingMarketController()
        internal
        view
        returns (ILendingMarketController)
    {
        return
            ILendingMarketController(
                getAddress(CONTRACT_LENDING_MARKET_CONTROLLER)
            );
    }

    function liquidations() internal view returns (ILiquidations) {
        return ILiquidations(getAddress(CONTRACT_LIQUIDATIONS));
    }

    function loan() internal view returns (ILoanV2) {
        return ILoanV2(getAddress(CONTRACT_LOAN));
    }

    function paymentAggregator() internal view returns (IPaymentAggregator) {
        return IPaymentAggregator(getAddress(CONTRACT_PAYMENT_AGGREGATOR));
    }

    function productAddressResolver()
        internal
        view
        returns (IProductAddressResolver)
    {
        return
            IProductAddressResolver(
                getAddress(CONTRACT_PRODUCT_ADDRESS_RESOLVER)
            );
    }

    function settlementEngine() internal view returns (ISettlementEngine) {
        return ISettlementEngine(getAddress(CONTRACT_SETTLEMENT_ENGINE));
    }

    function termStructure() internal view returns (ITermStructure) {
        return ITermStructure(getAddress(CONTRACT_TERM_STRUCTURE));
    }
}
