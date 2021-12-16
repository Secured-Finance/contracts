// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/**
 * @title IProduct is a common interface for various products on secured finance protocol 
 */
interface IProduct {
    
    event Liquidate(bytes32 dealId);
    event RequestTermination(bytes32 dealId, address indexed requestedBy);
    event RejectTermination(bytes32 dealId, address indexed rejectedBy);
    event EarlyTermination(bytes32 dealId, address indexed acceptedBy, uint256 payment);
    event MarkToMarket(bytes32 dealId, uint256 prevPV, uint256 currPV);

    /**
     * Triggered to liquidate existing deal of this product type
     * @param dealId Deal unique id in bytes32 word.
     */
    function liquidate(bytes32 dealId) external;

    /**
     * Triggered to request early termination of this specific deal
     * @param dealId Deal unique id in bytes32 word.
     */
    function requestTermination(bytes32 dealId) external;

    /**
     * Triggered to reject previously requested early termination of this deal
     * @param dealId Deal unique id in bytes32 word.
     */
    function rejectTermination(bytes32 dealId) external;

    /**
     * Triggered to accept previously requested early termination of this deal
     * @param dealId Deal unique id in bytes32 word.
     */
    function acceptTermination(bytes32 dealId) external;

    /**
     * Triggered to update present value of the deal
     * @param dealId Deal unique id in bytes32 word.
     */
    function markToMarket(bytes32 dealId) external returns (bool);

    // /**
    //  * Returns the state of the deal by `dealId`
    //  * @param dealId Deal unique id in bytes32 word.
    //  *
    //  * @return State identifier
    //  */
    // function getDealState(bytes32 dealId) external view returns (uint8);
    
    /**
     * Returns the main currency of the deal.
     * @param dealId Deal unique id in bytes32 word.
     *
     * @return Currency short identifier.
     */
    function getDealCurrency(bytes32 dealId) external view returns (bytes32);

    /**
     * Returns previously saved present value of the deal.
     * @param dealId Deal unique id in bytes32 word.
     *
     * @return Present value previously saved during mark-to-market.
     */
    function getDealLastPV(
        address party0, 
        address party1, 
        bytes32 dealId
    ) external view returns (uint256, uint256);

    /**
     * Triggers to recalculate and return current present value of the deal.
     * @param dealId Deal unique id in bytes32 word.
     *
     * @return Present value at the time of execution.
     */
    function getDealPV(bytes32 dealId) external view returns (uint256);

    /**
     * Returns settlement status of the deal by `dealId`
     * @param dealId Deal unique id in bytes32 word.
     *
     * @return Settlement bool identifier
     */
    function getDealSettlementStatus(bytes32 dealId) external view returns (bool);

    /**
     * Get the version of the underlying contract.
     *
     * @return Version number.
     */
    function getVersion() external view returns (uint16);

}