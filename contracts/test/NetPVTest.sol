// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/NetPV.sol";

contract NetPVTest {
    mapping(bytes32 => mapping(bytes32 => NetPV.CcyNetting)) private _ccyNettings;
    bytes32 public ccy = "0xSampleCCY";

    function get(address party0, address party1)
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        NetPV.CcyNetting memory netting = _get(party0, party1);

        return (netting.unsettled0PV, netting.unsettled1PV, netting.party0PV, netting.party1PV);
    }

    function getGasCostOfGet(address party0, address party1) public view returns (uint256) {
        uint256 gasBefore = gasleft();
        _get(party0, party1);

        return gasBefore - gasleft();
    }

    function _get(address party0, address party1) internal view returns (NetPV.CcyNetting memory) {
        return NetPV.get(_ccyNettings, party0, party1, ccy);
    }

    function use(
        address party0,
        address party1,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) public {
        NetPV.CcyNetting memory nettingBefore = _get(party0, party1);

        NetPV.use(_ccyNettings, party0, party1, ccy, amount0, amount1, isSettled);

        NetPV.CcyNetting memory nettingAfter = _get(party0, party1);

        if (isSettled) {
            require(
                nettingAfter.party0PV == nettingBefore.party0PV + amount0 &&
                    nettingAfter.party1PV == nettingBefore.party1PV + amount1,
                "INCORRECT_CCY_NETTING_USE"
            );
        } else {
            require(
                nettingAfter.unsettled0PV == nettingBefore.unsettled0PV + amount0 &&
                    nettingAfter.unsettled1PV == nettingBefore.unsettled1PV + amount1,
                "INCORRECT_CCY_NETTING_USE"
            );
        }
    }

    function settle(
        address party0,
        address party1,
        uint256 amount0,
        uint256 amount1
    ) public {
        NetPV.CcyNetting memory nettingBefore = _get(party0, party1);

        NetPV.settle(_ccyNettings, party0, party1, ccy, amount0, amount1);

        NetPV.CcyNetting memory nettingAfter = _get(party0, party1);

        require(
            nettingAfter.unsettled0PV == nettingBefore.unsettled0PV - amount0 &&
                nettingAfter.party0PV == nettingBefore.party0PV + amount0,
            "INCORRECT_CCY_NETTING_SETTLE"
        );

        require(
            nettingAfter.unsettled1PV == nettingBefore.unsettled1PV - amount1 &&
                nettingAfter.party1PV == nettingBefore.party1PV + amount1,
            "INCORRECT_CCY_NETTING_SETTLE"
        );
    }

    function release(
        address party0,
        address party1,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) public {
        NetPV.CcyNetting memory nettingBefore = _get(party0, party1);

        NetPV.release(_ccyNettings, party0, party1, ccy, amount0, amount1, isSettled);

        NetPV.CcyNetting memory nettingAfter = _get(party0, party1);

        if (isSettled) {
            require(
                nettingAfter.party0PV == nettingBefore.party0PV - amount0 &&
                    nettingAfter.party1PV == nettingBefore.party1PV - amount1,
                "INCORRECT_CCY_NETTING_RELEASE"
            );
        } else {
            require(
                nettingAfter.unsettled0PV == nettingBefore.unsettled0PV - amount0 &&
                    nettingAfter.unsettled1PV == nettingBefore.unsettled1PV - amount1,
                "INCORRECT_CCY_NETTING_RELEASE"
            );
        }
    }

    function update(
        address party0,
        address party1,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) public {
        NetPV.CcyNetting memory nettingBefore = _get(party0, party1);

        NetPV.update(_ccyNettings, party0, party1, ccy, prevPV0, prevPV1, currentPV0, currentPV1);

        NetPV.CcyNetting memory nettingAfter = _get(party0, party1);

        require(
            nettingAfter.party0PV == nettingBefore.party0PV - prevPV0 + currentPV0,
            "INCORRECT_CCY_NETTING_UPDATE"
        );

        require(
            nettingAfter.party1PV == nettingBefore.party1PV - prevPV1 + currentPV1,
            "INCORRECT_CCY_NETTING_SETTLE"
        );
    }

    function clear(address party0, address party1) public {
        NetPV.clear(_ccyNettings, party0, party1, ccy);
        NetPV.CcyNetting memory netting = _get(party0, party1);

        require(
            netting.unsettled0PV == 0 &&
                netting.unsettled1PV == 0 &&
                netting.party0PV == 0 &&
                netting.party1PV == 0,
            "INCORRECT_POSITION_CLEAR"
        );
    }
}
