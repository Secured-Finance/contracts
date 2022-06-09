// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./libraries/AddressPacking.sol";
import "./interfaces/IProduct.sol";
import "./interfaces/ILiquidations.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/Ownable.sol";
import {LiquidationsStorage as Storage} from "./storages/LiquidationsStorage.sol";

contract Liquidations is ILiquidations, MixinAddressResolver, Ownable, Initializable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @dev Modifier to make a function callable only by liquidation agent.
     */
    modifier onlyLiquidationAgent() {
        require(Storage.slot().liquidationAgents.contains(msg.sender), "INVALID ACCESS");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address owner,
        address resolver,
        uint256 offset
    ) public initializer {
        _transferOwnership(owner);
        registerAddressResolver(resolver);
        Storage.slot().liquidationAgents.add(owner);
        Storage.slot().offset = offset;
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.PRODUCT_ADDRESS_RESOLVER;
    }

    function isAcceptedContract(address account) internal view override returns (bool) {
        return
            productAddressResolver().isRegisteredProductContract(account) ||
            super.isAcceptedContract(account);
    }

    /**
     * @dev Updates offset for maximum number of deals liquidated per one execution.
     * @param _offset New liquidation offset
     */
    function updateLiquidationOffset(uint256 _offset) public override onlyOwner {
        require(_offset > 0, "INCORRECT_OFFSET");
        emit OffsetUpdated(Storage.slot().offset, _offset);
        Storage.slot().offset = _offset;
    }

    /**
     * @dev Adds liquidation agent address into the set.
     * @param _liquidationAgent Liquidation agent address
     */
    function addLiquidationAgent(address _liquidationAgent) public override onlyOwner {
        Storage.slot().liquidationAgents.add(_liquidationAgent);
        emit LiquidationAgentAdded(_liquidationAgent);
    }

    /**
     * @dev Removes liquidation agent address from the set.
     * @param _liquidationAgent Liquidation agent address
     */
    function removeLiquidationAgent(address _liquidationAgent) public override onlyOwner {
        Storage.slot().liquidationAgents.remove(_liquidationAgent);
        emit LiquidationAgentRemoved(_liquidationAgent);
    }

    function addDealToLiquidationQueue(
        address party0,
        address party1,
        bytes32 dealId
    ) public override onlyAcceptedContracts {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        EnumerableSet.Bytes32Set storage set = Storage.slot().liquidationQueue[packedAddrs];

        require(!set.contains(dealId), "ALREADY EXISTING DEAL");
        set.add(dealId);

        emit DealAddedToLiquidationQueue(party0, party1, dealId);
    }

    function removeDealFromLiquidationQueue(
        address party0,
        address party1,
        bytes32 dealId
    ) public override onlyAcceptedContracts {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        EnumerableSet.Bytes32Set storage set = Storage.slot().liquidationQueue[packedAddrs];

        require(set.contains(dealId), "NON EXISTING DEAL");
        set.remove(dealId);

        emit DealRemovedFromLiquidationQueue(party0, party1, dealId);
    }

    /**
     * @dev Triggers to liquidate multiple deals according to the liquidation queue
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     */
    function liquidateDeals(address party0, address party1) public override onlyLiquidationAgent {
        (bool coverage0, bool coverage1) = collateralAggregator().isCovered(
            party0,
            party1,
            "",
            0,
            0,
            false
        );
        if (coverage0 && coverage1) return;

        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        EnumerableSet.Bytes32Set storage set = Storage.slot().liquidationQueue[packedAddrs];

        uint256 numDeals = set.length();
        uint256 numLiquidations;
        numDeals > Storage.slot().offset
            ? numLiquidations = Storage.slot().offset
            : numLiquidations = numDeals;
        bytes32[] memory dealIds = new bytes32[](numLiquidations);

        for (uint256 i = 0; i < numLiquidations; i++) {
            bytes32 dealId = set.at(i);
            dealIds[i] = dealId;
        }

        _liquidateDeals(party0, party1, dealIds);
    }

    /**
     * @dev Triggers to liquidate multiple deals with specific `_dealIds`.
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param dealIds Array of Deal ID to liquidate
     */
    function liquidateDeals(
        address party0,
        address party1,
        bytes32[] memory dealIds
    ) public override onlyLiquidationAgent {
        require(dealIds.length < Storage.slot().offset, "TOO MUCH DEALS");
        (bool coverage0, bool coverage1) = collateralAggregator().isCovered(
            party0,
            party1,
            "",
            0,
            0,
            false
        );
        if (coverage0 && coverage1) return;

        _liquidateDeals(party0, party1, dealIds);
    }

    /**
     * @dev Triggers to get liquidation offset.
     */
    function getOffset() external view returns (uint256) {
        return Storage.slot().offset;
    }

    struct LiquidationLocalVars {
        bytes32 dealId;
        uint256 dealPV0;
        uint256 dealPV1;
        uint256 totalLiquidationPVInETH0;
        uint256 totalLiquidationPVInETH1;
        uint256 exchangeRate;
        bytes32 currency;
        address product;
    }

    function _liquidateDeals(
        address party0,
        address party1,
        bytes32[] memory dealIds
    ) internal {
        LiquidationLocalVars memory vars;

        for (uint256 i = 0; i < dealIds.length; i++) {
            vars.dealId = dealIds[i];
            vars.product = productAddressResolver().getProductContractByDealId(vars.dealId);

            vars.currency = IProduct(vars.product).getDealCurrency(vars.dealId);

            (vars.dealPV0, vars.dealPV1) = IProduct(vars.product).getDealLastPV(
                party0,
                party1,
                vars.dealId
            );
            vars.exchangeRate = uint256(currencyController().getLastETHPrice(vars.currency));

            vars.dealPV0 = (vars.dealPV0 * vars.exchangeRate) / 1e18;
            vars.dealPV1 = (vars.dealPV1 * vars.exchangeRate) / 1e18;

            vars.totalLiquidationPVInETH0 = vars.totalLiquidationPVInETH0 + vars.dealPV0;
            vars.totalLiquidationPVInETH1 = vars.totalLiquidationPVInETH1 + vars.dealPV1;

            IProduct(vars.product).liquidate(vars.dealId);
        }

        if (vars.totalLiquidationPVInETH0 > 0) {
            collateralAggregator().liquidate(party0, party1, vars.totalLiquidationPVInETH0);
        }

        if (vars.totalLiquidationPVInETH1 > 0) {
            collateralAggregator().liquidate(party1, party0, vars.totalLiquidationPVInETH1);
        }
    }
}
