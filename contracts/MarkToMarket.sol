// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ProtocolTypes.sol";
import "./interfaces/IMarketController.sol";
import "./interfaces/IMarkToMarket.sol";
import "./interfaces/IProduct.sol";
import "./mixins/MixinAddressResolver.sol";

contract MarkToMarket is IMarkToMarket, MixinAddressResolver {
    using SafeMath for uint256;

    uint256 constant NOTICE = 2 weeks;

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) {}

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = CONTRACT_PRODUCT_ADDRESS_RESOLVER;
    }

    struct PresentValueCalcLocalVars {
        bytes4 prefix;
        address controller;
        IMarketController controllerContract;
        address product;
        IProduct productContract;
    }

    /**
     * @dev Triggers to update present value for a single deal.
     * @param dealId Deal ID to update PV for
     */
    function updatePV(bytes32 dealId) public override {
        address product = productAddressResolver().getProductContractByDealId(dealId);

        require(IProduct(product).markToMarket(dealId), "CAN'T DO MARK-TO-MARKET");
    }

    /**
     * @dev Triggers to update present value for a multiple deals.
     * @param dealIds Array of Deal IDs to update PV for
     */
    function updatePVs(bytes32[] memory dealIds) public override {
        PresentValueCalcLocalVars memory vars;

        for (uint256 i = 0; i < dealIds.length; i++) {
            bytes32 dealId = dealIds[i];

            vars.product = productAddressResolver().getProductContractByDealId(dealId);

            require(IProduct(vars.product).markToMarket(dealId), "CAN'T DO MARK-TO-MARKET");
        }
    }
}
