// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ProtocolTypes.sol";
import "./libraries/TimeSlot.sol";
import "./libraries/AddressPacking.sol";
import "./libraries/BokkyPooBahsDateTimeLibrary.sol";
import "./interfaces/ICloseOutNetting.sol";
import "./interfaces/IMarkToMarket.sol";
import "./interfaces/IPaymentAggregator.sol";
import "hardhat/console.sol";

/**
 * @title Payment Aggregator contract is used to aggregate payments
 * between counterparties in bilateral relationships. Those payments
 * are defined per counterparties addresses (packed into one bytes32),
 * main settlement currency and payment date.
 *
 * Contract linked to all product based contracts like Loan, Swap, etc.
 */
contract PaymentAggregator is IPaymentAggregator, ProtocolTypes {
    using SafeMath for uint256;
    using Address for address;
    using TimeSlot for TimeSlot.Slot;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public override owner;
    uint256 public override settlementWindow = 2;
    uint256 constant MAXPAYNUM = 6;

    // Linked contract addresses
    EnumerableSet.AddressSet private paymentAggregatorUsers;
    ICloseOutNetting private closeOutNetting;
    IMarkToMarket private markToMarket;

    // Mapping structure for storing TimeSlots
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => TimeSlot.Slot))) _timeSlots;
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => EnumerableSet.Bytes32Set)))
        private deals;

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
     * @dev Modifier to check if msg.sender is payment aggregator user
     */
    modifier acceptedContract() {
        require(
            paymentAggregatorUsers.contains(msg.sender),
            "not allowed to use payment aggregator"
        );
        _;
    }

    /**
     * @dev Modifier to make a function callable only by passing contract address checks.
     */
    modifier onlyContractAddr(address addr) {
        require(addr != address(0), "INVALID_ADDRESS");
        require(addr.isContract(), "NOT_CONTRACT");
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     */
    constructor() public {
        owner = msg.sender;
    }

    /**
     * @dev Trigers to add contract address to payment aggregator users address set
     * @param _user Payment aggregator user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addPaymentAggregatorUser(address _user)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(_user != address(0), "Zero address");
        require(_user.isContract(), "Can't add non-contract address");
        require(
            !paymentAggregatorUsers.contains(_user),
            "Can't add existing address"
        );
        return paymentAggregatorUsers.add(_user);
    }

    /**
     * @dev Trigers to remove payment aggregator user from address set
     * @param _user Payment aggregator user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on removing non-existing payment aggregator user
     */
    function removePaymentAggregatorUser(address _user)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(
            paymentAggregatorUsers.contains(_user),
            "Can't remove non-existing user"
        );
        return paymentAggregatorUsers.remove(_user);
    }

    /**
     * @dev Trigers to check if provided `addr` is a payment aggregator user from address set
     * @param _user Contract address to check if it's a payment aggregator user
     *
     */
    function isPaymentAggregatorUser(address _user)
        public
        view
        override
        returns (bool)
    {
        return paymentAggregatorUsers.contains(_user);
    }

    /**
     * @dev Trigers to set close out netting smart contract
     * @param _contract CloseOutNetting smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function setCloseOutNetting(address _contract)
        public
        onlyOwner
        onlyContractAddr(_contract)
    {
        emit UpdateCloseOutNetting(address(closeOutNetting), _contract);
        closeOutNetting = ICloseOutNetting(_contract);
    }

    /**
     * @dev Trigers to set mark to market smart contract
     * @param _contract MarkToMarket smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function setMarkToMarket(address _contract)
        public
        onlyOwner
        onlyContractAddr(_contract)
    {
        emit UpdateMarkToMarket(address(markToMarket), _contract);
        markToMarket = IMarkToMarket(_contract);
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
    ) external override acceptedContract {
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

        closeOutNetting.addPayments(
            party0,
            party1,
            ccy,
            vars.totalPayment0,
            vars.totalPayment1
        );
    }

    struct PaymentSettlementLocalVars {
        bytes32 packedAddrs;
        bool flipped;
        bytes32 slotPosition;
        uint256 payment;
        address verifier;
        bytes32 txHash;
        uint256 year;
        uint256 month;
        uint256 day;
    }

    /**
     * @dev External function to verify payment by msg.sender, uses timestamp to identify TimeSlot.
     * @param verifier Payment verifier address
     * @param counterparty Counterparty address
     * @param ccy Main payment settlement currency
     * @param timestamp Main timestamp for TimeSlot
     * @param payment Main payment settlement currency
     * @param txHash Main payment settlement currency
     */
    function verifyPayment(
        address verifier,
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        uint256 payment,
        bytes32 txHash
    ) external override {
        require(_checkSettlementWindow(timestamp), "OUT OF SETTLEMENT WINDOW");
        PaymentSettlementLocalVars memory vars;

        vars.payment = payment;
        vars.txHash = txHash;
        vars.verifier = verifier;

        (vars.year, vars.month, vars.day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        vars.slotPosition = TimeSlot.position(vars.year, vars.month, vars.day);

        TimeSlot.verifyPayment(
            _timeSlots,
            verifier,
            counterparty,
            ccy,
            vars.slotPosition,
            vars.payment,
            vars.txHash
        );

        emit VerifyPayment(
            verifier,
            counterparty,
            ccy,
            vars.slotPosition,
            vars.year,
            vars.month,
            vars.day,
            payment,
            txHash
        );
    }

    /**
     * @dev External function to settle payment using timestamp to identify TimeSlot.
     * @param verifier Payment settlement verifier address
     * @param counterparty Counterparty address
     * @param ccy Main payment settlement currency
     * @param timestamp Main timestamp for TimeSlot
     * @param txHash Main payment settlement currency
     */
    function settlePayment(
        address verifier,
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        bytes32 txHash
    ) external override {
        require(_checkSettlementWindow(timestamp), "OUT OF SETTLEMENT WINDOW");
        PaymentSettlementLocalVars memory vars;

        vars.txHash = txHash;
        vars.verifier = verifier;

        (vars.year, vars.month, vars.day) = BokkyPooBahsDateTimeLibrary
            .timestampToDate(timestamp);
        vars.slotPosition = TimeSlot.position(vars.year, vars.month, vars.day);

        TimeSlot.Slot memory timeSlot = TimeSlot.get(
            _timeSlots,
            verifier,
            counterparty,
            ccy,
            vars.year,
            vars.month,
            vars.day
        );

        TimeSlot.settlePayment(
            _timeSlots,
            verifier,
            counterparty,
            ccy,
            vars.slotPosition,
            vars.txHash
        );

        bytes32[] memory dealIds = getDealsFromSlot(
            verifier,
            counterparty,
            ccy,
            vars.slotPosition
        );
        markToMarket.updatePVs(dealIds);

        closeOutNetting.removePayments(
            verifier,
            counterparty,
            ccy,
            timeSlot.totalPayment0,
            timeSlot.totalPayment1
        );

        emit SettlePayment(
            verifier,
            counterparty,
            ccy,
            vars.slotPosition,
            vars.year,
            vars.month,
            vars.day,
            txHash
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
    ) external override acceptedContract {
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

        closeOutNetting.removePayments(
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
    ) public view returns (TimeSlot.Slot memory timeSlot) {
        timeSlot = TimeSlot.get(
            _timeSlots,
            party0,
            party1,
            ccy,
            year,
            month,
            day
        );
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
    ) public view returns (TimeSlot.Slot memory timeSlot) {
        timeSlot = TimeSlot.getBySlotId(_timeSlots, party0, party1, ccy, slot);
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
    function _checkSettlementWindow(uint256 targetTime)
        internal
        view
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