// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./libraries/CloseOut.sol";
import "./interfaces/ICloseOutNetting.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/Proxyable.sol";
import {CloseOutNettingStorage as Storage} from "./storages/CloseOutNettingStorage.sol";

/**
 * @title Close Out Netting contract is used in close out operations
 * Close out is the process while one of the counterparties declared
 * as defaulted party and all deals should be terminated
 *
 * Contract linked to all product based contracts (ex. Loan, Swap, etc), and Collateral Aggregator contract.
 */
contract CloseOutNetting is ICloseOutNetting, MixinAddressResolver, Proxyable {
    /**
     * @dev Modifier to make a function callable only by defaulted counterparty.
     */
    modifier defaultedParty() {
        require(Storage.slot().isDefaulted[msg.sender]);
        _;
    }

    /**
     * @dev Modifier to make a function callable only by non defaulted counterparty.
     */
    modifier nonDefaultedParty() {
        require(!Storage.slot().isDefaulted[msg.sender]);
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address resolver) public initializer onlyProxy {
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.PAYMENT_AGGREGATOR;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.PAYMENT_AGGREGATOR;
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
        payment = CloseOut.get(Storage.slot().closeOuts, party0, party1, ccy);
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
        CloseOut.addPayments(Storage.slot().closeOuts, party0, party1, ccy, payment0, payment1);

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
        CloseOut.removePayments(Storage.slot().closeOuts, party0, party1, ccy, payment0, payment1);

        emit RemoveCloseOutPayments(party0, party1, ccy, payment0, payment1);
    }

    /**
     * @dev External function to check if `_party` is in default
     */
    function checkDefault(address _party) external view override returns (bool) {
        return Storage.slot().isDefaulted[_party];
    }

    /**
     * @dev Internal function to declare default for `_defaultedParty`
     */
    function _handleDefault(address _defaultedParty) internal {
        Storage.slot().isDefaulted[_defaultedParty] = true;
    }

    // TODO: Need to update using CollateralAggregatorV2
    // /**
    //  * @dev Internal function to execute close out netting payment
    //  * liquidates ETH from party's collateral with bigger net payment to their counterparty
    //  * @notice Only triggers if one of the counterparties in default
    //  */
    // function _handleCloseOut(address party0, address party1) internal {
    //     require(
    //         Storage.slot().isDefaulted[party0] || Storage.slot().isDefaulted[party1],
    //         "NON_DEFAULTED_PARTIES"
    //     );
    //     bytes32[] memory currencies = collateralAggregator.getExposedCurrencies(
    //         party0,
    //         party1
    //     );

    //     for (uint256 i = 0; i < currencies.length; i++) {
    //         bytes32 ccy = currencies[i];

    //         CloseOut.Payment memory payment = CloseOut.get(
    //             Storage.slot().closeOuts,
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

    //         CloseOut.close(Storage.slot().closeOuts, party0, party1, ccy);
    //     }
    // }
}
