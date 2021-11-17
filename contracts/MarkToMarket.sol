// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./ProtocolTypes.sol";
import './interfaces/IMarketConroller.sol';
import './interfaces/IMarkToMarket.sol';
import './interfaces/IPaymentAggregator.sol';
import './interfaces/IProduct.sol';
import './interfaces/IMarketConroller.sol';
import './interfaces/IProductAddressResolver.sol';
import "./libraries/DealId.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MarkToMarket is ProtocolTypes, IMarkToMarket {
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
        IMarketConroller controllerContract;
        address product;
        IProduct productContract;
    }

    /**
    * @dev Triggers to update present value for a single deal.
    * @param dealId Deal ID to update PV for
    */
    function updatePV(bytes32 dealId) public override {
        PresentValueCalcLocalVars memory vars;
        
        vars.prefix = DealId.getPrefix(dealId);
        vars.product = productResolver.getProductContract(vars.prefix);

        require(IProduct(vars.product).markToMarket(dealId), "CAN'T DO MARK-TO-MARKET");
    }

    /**
    * @dev Triggers to update present value for a multiple deals.
    * @param dealIds Array of Deal IDs to update PV for
    */
    function updatePVs(bytes32[] memory dealIds) public override {
        PresentValueCalcLocalVars memory vars;

        for (uint256 i = 0; i < dealIds.length; i++) {
            bytes32 dealId = dealIds[i];
            
            vars.prefix = DealId.getPrefix(dealId);
            vars.product = productResolver.getProductContract(vars.prefix);
            // vars.controller = productResolver.getControllerContract(vars.prefix);

            require(IProduct(vars.product).markToMarket(dealId), "CAN'T DO MARK-TO-MARKET");
        }
    }
}