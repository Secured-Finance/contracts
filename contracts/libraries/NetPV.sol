// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AddressPacking.sol";

library NetPV {
    using SafeMath for uint256;

    /**
     * @dev CcyNetting keeps track of total amount of obligations owed
     * by two counterparties per currency, used to calculate the
     * total amount of collateral coverage in bilateral position
     */
    struct CcyNetting {
        uint256 unsettled0PV;
        uint256 unsettled1PV;
        uint256 party0PV;
        uint256 party1PV;
    }

    /**
     * @dev Helper to return CcyNetting structure in correct order acccording
     * to in which order counterparty addresses are passed
     */
    function _handleFlippedCase(NetPV.CcyNetting memory netting, bool flipped)
        internal
        pure
        returns (NetPV.CcyNetting memory)
    {
        if (flipped) {
            uint256 unsettledPV = netting.unsettled0PV;
            uint256 partyPV = netting.party0PV;

            netting.unsettled0PV = netting.unsettled1PV;
            netting.unsettled1PV = unsettledPV;
            netting.party0PV = netting.party1PV;
            netting.party1PV = partyPV;
        }

        return netting;
    }

    /**
     * @dev Returns the present value netting between 2 counterparties
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     */
    function get(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy
    ) internal view returns (NetPV.CcyNetting memory netting) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        netting = self[packedAddrs][ccy];
        netting = _handleFlippedCase(netting, flipped);
    }

    /**
     * @dev Returns the present value netting between 2 counterparties
     * including hypothetical present value
     *
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     * @param additionalPV0 Hypothetical PV for first party
     * @param additionalPV1 Hypothetical PV for second party
     * @param isSettled Boolean wether hypothetical PV settled or not
     */
    function get(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 additionalPV0,
        uint256 additionalPV1,
        bool isSettled
    ) internal view returns (NetPV.CcyNetting memory netting) {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        netting = self[packedAddrs][ccy];
        netting = _handleFlippedCase(netting, flipped);

        if (isSettled) {
            netting.party0PV = netting.party0PV.add(additionalPV0);
            netting.party1PV = netting.party1PV.add(additionalPV1);
        } else {
            netting.unsettled0PV = netting.unsettled0PV.add(additionalPV0);
            netting.unsettled1PV = netting.unsettled1PV.add(additionalPV1);
        }
    }

    /**
     * @dev Triggers to increase the amount of obligations in PV netting
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     * @param amount0 Amount of funds to be added for first counterparty
     * @param amount1 Amount of funds to be added for second counterparty
     * @param isSettled Boolean statement if obligations are settled already
     */
    function use(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) internal {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        NetPV.CcyNetting storage netting = self[packedAddrs][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.add(amount0)
                    : netting.unsettled0PV = netting.unsettled0PV.add(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.add(amount1)
                    : netting.unsettled1PV = netting.unsettled1PV.add(amount1);
            }
        } else {
            if (amount0 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.add(amount0)
                    : netting.unsettled1PV = netting.unsettled1PV.add(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.add(amount1)
                    : netting.unsettled0PV = netting.unsettled0PV.add(amount1);
            }
        }
    }

    /**
     * @dev Triggers to settle previously added obligations in PV netting
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     * @param amount0 Amount of funds to be settled for first counterparty
     * @param amount1 Amount of funds to be settled for second counterparty
     */
    function settle(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) internal {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        NetPV.CcyNetting storage netting = self[packedAddrs][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                netting.unsettled0PV = netting.unsettled0PV.sub(amount0);
                netting.party0PV = netting.party0PV.add(amount0);
            }
            if (amount1 > 0) {
                netting.unsettled1PV = netting.unsettled1PV.sub(amount1);
                netting.party1PV = netting.party1PV.add(amount1);
            }
        } else {
            if (amount0 > 0) {
                netting.unsettled1PV = netting.unsettled1PV.sub(amount0);
                netting.party1PV = netting.party1PV.add(amount0);
            }
            if (amount1 > 0) {
                netting.unsettled0PV = netting.unsettled0PV.sub(amount1);
                netting.party0PV = netting.party0PV.add(amount1);
            }
        }
    }

    /**
     * @dev Triggers to release PV obligations from netting
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     * @param amount0 Amount of funds to be removed for first counterparty
     * @param amount1 Amount of funds to be removed for second counterparty
     */
    function release(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) internal {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        NetPV.CcyNetting storage netting = self[packedAddrs][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.sub(amount0)
                    : netting.unsettled0PV = netting.unsettled0PV.sub(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.sub(amount1)
                    : netting.unsettled1PV = netting.unsettled1PV.sub(amount1);
            }
        } else {
            if (amount0 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.sub(amount0)
                    : netting.unsettled1PV = netting.unsettled1PV.sub(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.sub(amount1)
                    : netting.unsettled0PV = netting.unsettled0PV.sub(amount1);
            }
        }
    }

    /**
     * @dev Triggers to update PV in bilateral netting during mark-to-market
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     * @param prevPV0 Previous present value to be substracted from total exposure for counterparty A
     * @param prevPV1 Previous present value to be substracted from total exposure for counterparty B
     * @param currentPV0 Current present value to be added to total exposure for counterparty A
     * @param currentPV1 Current present value to be added to total exposure for counterparty B
     */
    function update(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) internal {
        (bytes32 packedAddrs, bool flipped) = AddressPacking.pack(
            party0,
            party1
        );
        NetPV.CcyNetting storage netting = self[packedAddrs][ccy];

        if (!flipped) {
            if (currentPV0 > 0) {
                netting.party0PV = netting.party0PV.sub(prevPV0).add(
                    currentPV0
                );
            }
            if (currentPV1 > 0) {
                netting.party1PV = netting.party1PV.sub(prevPV1).add(
                    currentPV1
                );
            }
        } else {
            if (currentPV0 > 0) {
                netting.party1PV = netting.party1PV.sub(prevPV0).add(
                    currentPV0
                );
            }
            if (currentPV1 > 0) {
                netting.party0PV = netting.party0PV.sub(prevPV1).add(
                    currentPV1
                );
            }
        }
    }

    /**
     * @dev Clears the state of PV netting
     * @param self The mapping with all present value nettings per currency
     * @param party0 First counterparty address
     * @param party1 Second counterparty address
     * @param ccy Present value currency
     */
    function clear(
        mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) storage self,
        address party0,
        address party1,
        bytes32 ccy
    ) internal {
        (bytes32 packedAddrs, ) = AddressPacking.pack(party0, party1);
        delete self[packedAddrs][ccy];
    }
}
