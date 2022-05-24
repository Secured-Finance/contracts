// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./ProtocolTypes.sol";
import "./interfaces/IMarketController.sol";
import "./interfaces/IMarkToMarket.sol";
import "./interfaces/IPaymentAggregator.sol";
import "./interfaces/IProduct.sol";
import "./interfaces/IProductAddressResolver.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MarkToMarket is IMarkToMarket {
    using SafeMath for uint256;

    uint256 constant NOTICE = 2 weeks;
    address public owner;

    // Contracts
    IProductAddressResolver productResolver;
    IPaymentAggregator paymentAggregator;

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract and connects to product address resolver contract
     */
    constructor(address _productResolver) public {
        owner = msg.sender;
        productResolver = IProductAddressResolver(_productResolver);
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
        address product = productResolver.getProductContractByDealId(dealId);

        require(
            IProduct(product).markToMarket(dealId),
            "CAN'T DO MARK-TO-MARKET"
        );
    }

    /**
     * @dev Triggers to update present value for a multiple deals.
     * @param dealIds Array of Deal IDs to update PV for
     */
    function updatePVs(bytes32[] memory dealIds) public override {
        PresentValueCalcLocalVars memory vars;

        for (uint256 i = 0; i < dealIds.length; i++) {
            bytes32 dealId = dealIds[i];

            vars.product = productResolver.getProductContractByDealId(dealId);
            // vars.controller = productResolver.getControllerContract(vars.prefix);

            require(
                IProduct(vars.product).markToMarket(dealId),
                "CAN'T DO MARK-TO-MARKET"
            );
        }
    }
}
