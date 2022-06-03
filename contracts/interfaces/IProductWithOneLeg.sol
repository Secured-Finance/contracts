// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IProduct.sol";

/**
 * @title IProductWithOneLeg is an extention over IProduct interface for
 * products with one leg of cashflows
 */
interface IProductWithOneLeg is IProduct {
    struct Schedule {
        uint256[] payments;
        uint256[] amounts;
        bool[] isSettled;
    }

    event Register(
        address indexed lender,
        address indexed borrower,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate,
        bytes32 indexed dealId
    );

    event Novation(bytes32 indexed dealId, address currLender);

    /**
     * Triggered to register new deal for this product type
     *
     * @param maker Order maker
     * @param taker orderTaker
     * @param side Order side
     * @param ccy Settlement currency
     * @param term Deal term
     * @param notional Notional amount of funds
     * @param rate Annual interest rate
     * @return dealId bytes32 string.
     */
    function register(
        address maker,
        address taker,
        uint8 side,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate
    ) external returns (bytes32 dealId);

    /**
     * Triggered to transfer lending obligations from msg.sender ot newOwner
     * @param dealId Deal unique id in bytes32 word.
     * @param newOwner ETH address of new product lender
     */
    function novation(bytes32 dealId, address newOwner) external;

    /**
     * Returns the payment schedule of the deal
     * @param dealId Deal unique id in bytes32 word.
     *
     * @return Payment schedule payment timestamps, payment amounts and settlement statuses
     */
    function getPaymentSchedule(bytes32 dealId)
        external
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        );
}
