// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProtocolTypes.sol";
import "./libraries/TimeSlot.sol";
import "./libraries/AddressPacking.sol";
import "./libraries/BokkyPooBahsDateTimeLibrary.sol";
import "./interfaces/IPaymentAggregator.sol";
import "./mixins/MixinAddressResolver.sol";

/**
 * @title Payment Aggregator contract is used to aggregate payments
 * between counterparties in bilateral relationships. Those payments
 * are defined per counterparties addresses (packed into one bytes32),
 * main settlement currency and payment date.
 *
 * Contract linked to all product based contracts like Loan, Swap, etc.
 */
contract PaymentAggregator is
    IPaymentAggregator,
    ProtocolTypes,
    MixinAddressResolver,
    Ownable
{
    using SafeMath for uint256;
    using Address for address;
    using TimeSlot for TimeSlot.Slot;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    uint256 public override settlementWindow = 2;
    uint256 constant MAXPAYNUM = 6;

    // Mapping structure for storing TimeSlots
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => TimeSlot.Slot))) _timeSlots;
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => EnumerableSet.Bytes32Set)))
        private deals;

    modifier onlySettlementEngine() {
        require(
            msg.sender == address(settlementEngine()),
            "NOT_SETTLEMENT_ENGINE"
        );
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) Ownable() {}

    function requiredContracts()
        public
        pure
        override
        returns (bytes32[] memory contracts)
    {
        contracts = new bytes32[](3);
        contracts[0] = CONTRACT_CLOSE_OUT_NETTING;
        contracts[1] = CONTRACT_MARK_TO_MARKET;
        contracts[2] = CONTRACT_LOAN;
    }

    function acceptedContracts()
        public
        pure
        override
        returns (bytes32[] memory contracts)
    {
        contracts = new bytes32[](1);
        contracts[0] = CONTRACT_LOAN;
    }

    struct TimeSlotPaymentsLocalVars {
        bytes32 packedAddrs;
        bool flipped;
        uint256 totalPayment0;
        uint256 totalPayment1;
        bytes32 slotPosition;
        uint256 year;
        uint256 month;
        uint256 day;
    }

    /**
     * @dev Triggered to add new payments for a deal
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main settlement currency in a deal
     * @param dealId Deal unique ID with prefix
     * @param timestamps Array of timestamps for timeslot identification
     * @param payments0 Array of cashflows owed by the first party
     * @param payments1 Array of cashflows owed by the second party
     */
    function registerPayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[] memory timestamps,
        uint256[] memory payments0,
        uint256[] memory payments1
    ) external override onlyAcceptedContracts {
        TimeSlotPaymentsLocalVars memory vars;
        (vars.packedAddrs, ) = AddressPacking.pack(party0, party1);

        for (uint256 i = 0; i < timestamps.length; i++) {
            if (timestamps[i] == 0) continue;

            (vars.year, vars.month, vars.day) = BokkyPooBahsDateTimeLibrary
                .timestampToDate(timestamps[i]);
            vars.slotPosition = TimeSlot.position(
                vars.year,
                vars.month,
                vars.day
            );
            deals[vars.packedAddrs][ccy][vars.slotPosition].add(dealId);

            if (payments0[i] > 0) {
                vars.totalPayment0 = vars.totalPayment0.add(payments0[i]);
            }

            if (payments1[i] > 0) {
                vars.totalPayment1 = vars.totalPayment1.add(payments1[i]);
            }

            TimeSlot.addPayment(
                _timeSlots,
                party0,
                party1,
                ccy,
                vars.slotPosition,
                payments0[i],
                payments1[i]
            );

            emit RegisterPayment(
                party0,
                party1,
                ccy,
                vars.slotPosition,
                vars.year,
                vars.month,
                vars.day,
                payments0[i],
                payments1[i]
            );
        }

        closeOutNetting().addPayments(
            party0,
            party1,
            ccy,
            vars.totalPayment0,
            vars.totalPayment1
        );
    }

    struct PaymentSettlementLocalVars {
        bytes32 slotPosition;
        uint256 payment;
        address verifier;
        address counterparty;
        bytes32 ccy;
        bytes32 settlementId;
        uint256 year;
        uint256 month;
        uint256 day;
        uint256 totalPayment0;
        uint256 totalPayment1;
        bool isSettled;
    }

    /**
     * @dev External function to verify payment by msg.sender, uses timestamp to identify TimeSlot.
     * @param verifier Payment verifier address
     * @param counterparty Counterparty address
     * @param ccy Main payment settlement currency
     * @param timestamp Main timestamp for TimeSlot
     * @param payment Main payment settlement currency
     * @param settlementId Main payment settlement id
     */
    function verifyPayment(
        address verifier,
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        uint256 payment,
        bytes32 settlementId
    ) external override {
        require(checkSettlementWindow(timestamp), "OUT_OF_SETTLEMENT_WINDOW");
        PaymentSettlementLocalVars memory vars;

        vars.payment = payment;
        vars.settlementId = settlementId;
        vars.verifier = verifier;
        vars.counterparty = counterparty;
        vars.ccy = ccy;

        (vars.year, vars.month, vars.day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        vars.slotPosition = TimeSlot.position(vars.year, vars.month, vars.day);

        TimeSlot.verifyPayment(
            _timeSlots,
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.slotPosition,
            vars.payment,
            vars.settlementId
        );

        emit VerifyPayment(
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.slotPosition,
            vars.year,
            vars.month,
            vars.day,
            vars.payment,
            vars.settlementId
        );

        vars.isSettled = TimeSlot.isSettled(
            _timeSlots,
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.slotPosition
        );

        if (vars.isSettled) {
            _settlePayment(vars);
        }
    }

    /**
     * @dev Internal function to settle payment using payment settlement local variables.
     * @param vars Local variables used in verifyPayment function
     */
    function _settlePayment(PaymentSettlementLocalVars memory vars) internal {
        // TODO: Rework the settlement workflow to reduce gas consumption
        (vars.totalPayment0, vars.totalPayment1, , , , ) = TimeSlot.get(
            _timeSlots,
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.year,
            vars.month,
            vars.day
        );

        bytes32[] memory dealIds = getDealsFromSlot(
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.slotPosition
        );
        markToMarket().updatePVs(dealIds);

        closeOutNetting().removePayments(
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.totalPayment0,
            vars.totalPayment1
        );

        emit SettlePayment(
            vars.verifier,
            vars.counterparty,
            vars.ccy,
            vars.slotPosition,
            vars.year,
            vars.month,
            vars.day,
            vars.settlementId
        );
    }

    /**
     * @dev Triggered to remove existing payments for a deal
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main settlement currency in a deal
     * @param dealId Deal unique ID with prefix
     * @param timestamps Array of timestamps for timeslot identification
     * @param payments0 Array of cashflows owed by the first party
     * @param payments1 Array of cashflows owed by the second party
     */
    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[] calldata timestamps,
        uint256[] calldata payments0,
        uint256[] calldata payments1
    ) external override onlyAcceptedContracts {
        TimeSlotPaymentsLocalVars memory vars;
        (vars.packedAddrs, ) = AddressPacking.pack(party0, party1);

        for (uint256 i = 0; i < timestamps.length; i++) {
            if (timestamps[i] == 0) continue;

            (vars.year, vars.month, vars.day) = BokkyPooBahsDateTimeLibrary
                .timestampToDate(timestamps[i]);
            vars.slotPosition = TimeSlot.position(
                vars.year,
                vars.month,
                vars.day
            );

            require(
                deals[vars.packedAddrs][ccy][vars.slotPosition].remove(dealId),
                "NON_REGISTERED_DEAL"
            );

            vars.totalPayment0 = vars.totalPayment0.add(payments0[i]);
            vars.totalPayment1 = vars.totalPayment1.add(payments1[i]);

            TimeSlot.removePayment(
                _timeSlots,
                party0,
                party1,
                ccy,
                vars.slotPosition,
                payments0[i],
                payments1[i]
            );

            emit RemovePayment(
                party0,
                party1,
                ccy,
                vars.slotPosition,
                vars.year,
                vars.month,
                vars.day,
                payments0[i],
                payments1[i]
            );
        }

        closeOutNetting().removePayments(
            party0,
            party1,
            ccy,
            vars.totalPayment0,
            vars.totalPayment1
        );
    }

    /**
     * @dev Returns the time slot between parties using slot id.
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     */
    function getTimeSlotByDate(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 year,
        uint256 month,
        uint256 day
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        return TimeSlot.get(_timeSlots, party0, party1, ccy, year, month, day);
    }

    /**
     * @dev Returns the time slot between parties using slot id.
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     * @param slot TimeSlot position
     */
    function getTimeSlotBySlotId(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 slot
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        return TimeSlot.getBySlotId(_timeSlots, party0, party1, ccy, slot);
    }

    /**
     * @dev Returns the time slot between parties using slot id.
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     * @param year Calendar year of the settlement
     * @param month Calendar month of the settlement
     * @param day Calendar day of the settlement
     * @param settlementId Settlement payment confirmation identifier
     */
    function getTimeSlotPaymentConfirmation(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 year,
        uint256 month,
        uint256 day,
        bytes32 settlementId
    ) public view returns (address, uint256) {
        return
            TimeSlot.getPaymentConfirmation(
                _timeSlots,
                party0,
                party1,
                ccy,
                year,
                month,
                day,
                settlementId
            );
    }

    /**
     * @dev Returns the time slot between parties using slot id.
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     * @param slot TimeSlot position
     * @param settlementId Settlement payment confirmation identifier
     */
    function getTimeSlotPaymentConfirmationById(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 slot,
        bytes32 settlementId
    ) public view returns (address, uint256) {
        return
            TimeSlot.getPaymentConfirmationById(
                _timeSlots,
                party0,
                party1,
                ccy,
                slot,
                settlementId
            );
    }

    /**
     * @dev Internal function to get TimeSlot position after adding days
     * @param timestamp Timestamp to add days
     * @param numSeconds number of seconds to add
     * @return Updated timestamp and TimeSlot position
     */
    function _slotPositionPlusDays(uint256 timestamp, uint256 numSeconds)
        internal
        pure
        returns (bytes32, uint256)
    {
        uint256 numDays = numSeconds.div(86400);
        timestamp = BokkyPooBahsDateTimeLibrary.addDays(timestamp, numDays);
        (uint256 year, uint256 month, uint256 day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        bytes32 slotPosition = TimeSlot.position(year, month, day);

        return (slotPosition, timestamp);
    }

    /**
     * @dev Internal function to get TimeSlot position
     * @param timestamp Timestamp for conversion
     * @return TimeSlot position
     */
    function _slotPosition(uint256 timestamp) internal pure returns (bytes32) {
        (uint256 year, uint256 month, uint256 day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        bytes32 slotPosition = TimeSlot.position(year, month, day);

        return slotPosition;
    }

    /**
     * @dev Triggers settlement status of the time slot
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Main payment settlement currency
     * @param timestamp TimeSlot timestamp
     * @return status Boolean if slot was settled
     */
    function isSettled(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 timestamp
    ) external view override returns (bool status) {
        (uint256 year, uint256 month, uint256 day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        bytes32 slotPosition = TimeSlot.position(year, month, day);

        status = TimeSlot.isSettled(
            _timeSlots,
            party0,
            party1,
            ccy,
            slotPosition
        );
    }

    /**
     * @dev Internal function to check if settlement payment is within available timeline
     * @param targetTime target time for settlement of time slot
     * @return Boolean if slot within the settlement window
     */
    function checkSettlementWindow(uint256 targetTime)
        public
        view
        override
        returns (bool)
    {
        uint256 time = block.timestamp;
        uint256 delta = BokkyPooBahsDateTimeLibrary.diffDays(time, targetTime);

        return !(delta > settlementWindow);
    }

    function getDealsFromSlot(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 slotPosition
    ) public view override returns (bytes32[] memory) {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        EnumerableSet.Bytes32Set storage set = deals[packedAddrs][ccy][
            slotPosition
        ];

        uint256 numDeals = set.length();
        bytes32[] memory dealIds = new bytes32[](numDeals);

        for (uint256 i = 0; i < numDeals; i++) {
            bytes32 deal = set.at(i);
            dealIds[i] = deal;
        }

        return dealIds;
    }
}
