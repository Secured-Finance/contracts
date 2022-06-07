// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./libraries/CloseOut.sol";
import "./interfaces/ICloseOutNetting.sol";
import "./mixins/MixinAddressResolver.sol";

/**
 * @title Close Out Netting contract is used in close out operations
 * Close out is the process while one of the counterparties declared
 * as defaulted party and all deals should be terminated
 *
 * Contract linked to all product based contracts (ex. Loan, Swap, etc), and Collateral Aggregator contract.
 */
contract CloseOutNetting is ICloseOutNetting, MixinAddressResolver {
    using Address for address;
    using CloseOut for CloseOut.Payment;

    // Mapping structure for storing Close Out payments
    mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) _closeOuts;

    // Mapping structure for storing default boolean per address
    mapping(address => bool) _isDefaulted;

    /**
     * @dev Modifier to make a function callable only by defaulted counterparty.
     */
    modifier defaultedParty() {
        require(_isDefaulted[msg.sender]);
        _;
    }

    /**
     * @dev Modifier to make a function callable only by non defaulted counterparty.
     */
    modifier nonDefaultedParty() {
        require(!_isDefaulted[msg.sender]);
        _;
    }

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) {}

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = CONTRACT_PAYMENT_AGGREGATOR;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = CONTRACT_PAYMENT_AGGREGATOR;
    }

    /**
     * @dev Returns the close out payment between two counterparties
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     */
    function getCloseOutPayment(
        address party0,
        address party1,
        bytes32 ccy
    ) public view returns (CloseOut.Payment memory payment) {
        payment = CloseOut.get(_closeOuts, party0, party1, ccy);
    }

    /**
     * @dev Triggers to add total payments during the registration of the deal in close out netting
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main settlement currency of the deal
     * @param payment0 Aggregated payment for first counterparty
     * @param payment1 Aggregated payment for second counterparty
     *
     * @notice Executed only be PaymentAggregator contract
     */
    function addPayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external override onlyAcceptedContracts {
        CloseOut.addPayments(_closeOuts, party0, party1, ccy, payment0, payment1);

        emit AddCloseOutPayments(party0, party1, ccy, payment0, payment1);
    }

    /**
     * @dev Triggers to remove aggregated payments during the liquidation of the deal in close out netting
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main settlement currency of the deal
     * @param payment0 Aggregated payment for first counterparty
     * @param payment1 Aggregated payment for second counterparty
     *
     * @notice Executed only be PaymentAggregator contract
     */
    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external override onlyAcceptedContracts {
        CloseOut.removePayments(_closeOuts, party0, party1, ccy, payment0, payment1);

        emit RemoveCloseOutPayments(party0, party1, ccy, payment0, payment1);
    }

    /**
     * @dev External function to check if `_party` is in default
     */
    function checkDefault(address _party) external view override returns (bool) {
        return _isDefaulted[_party];
    }

    /**
     * @dev Internal function to declare default for `_defaultedParty`
     */
    function _handleDefault(address _defaultedParty) internal {
        _isDefaulted[_defaultedParty] = true;
    }

    // TODO: Need to update using CollateralAggregatorV2
    // /**
    //  * @dev Internal function to execute close out netting payment
    //  * liquidates ETH from party's collateral with bigger net payment to their counterparty
    //  * @notice Only triggers if one of the counterparties in default
    //  */
    // function _handleCloseOut(address party0, address party1) internal {
    //     require(
    //         _isDefaulted[party0] || _isDefaulted[party1],
    //         "NON_DEFAULTED_PARTIES"
    //     );
    //     bytes32[] memory currencies = collateralAggregator.getExposedCurrencies(
    //         party0,
    //         party1
    //     );

    //     for (uint256 i = 0; i < currencies.length; i++) {
    //         bytes32 ccy = currencies[i];

    //         CloseOut.Payment memory payment = CloseOut.get(
    //             _closeOuts,
    //             party0,
    //             party1,
    //             ccy
    //         );

    //         if (payment.flipped) {
    //             collateralAggregator.liquidate(
    //                 party1,
    //                 party0,
    //                 ccy,
    //                 payment.netPayment
    //             );
    //         } else {
    //             collateralAggregator.liquidate(
    //                 party0,
    //                 party1,
    //                 ccy,
    //                 payment.netPayment
    //             );
    //         }

    //         CloseOut.close(_closeOuts, party0, party1, ccy);
    //     }
    // }
}
