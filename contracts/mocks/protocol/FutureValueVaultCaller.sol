// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";
import {IFutureValueVault} from "../../protocol/interfaces/IFutureValueVault.sol";
import {FilledOrder, PartiallyFilledOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

contract FutureValueVaultCaller {
    IBeaconProxyController public beaconProxyController;
    mapping(uint8 => address) public futureValueVaults;
    mapping(bytes32 => uint8) public orderBookIdLists;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function getFutureValueVault(uint8 _orderBookId) external view returns (address) {
        return futureValueVaults[_orderBookId];
    }

    function deployFutureValueVault(uint8 _orderBookId) external {
        futureValueVaults[_orderBookId] = beaconProxyController.deployFutureValueVault();
    }

    function increase(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external {
        IFutureValueVault(futureValueVaults[_orderBookId]).increase(
            _orderBookId,
            _user,
            _amount,
            _maturity
        );
    }

    function decrease(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external {
        IFutureValueVault(futureValueVaults[_orderBookId]).decrease(
            _orderBookId,
            _user,
            _amount,
            _maturity
        );
    }

    function transferFrom(
        uint8 _orderBookId,
        address _sender,
        address _receiver,
        int256 _amount,
        uint256 _maturity
    ) external {
        IFutureValueVault(futureValueVaults[_orderBookId]).transferFrom(
            _orderBookId,
            _sender,
            _receiver,
            _amount,
            _maturity
        );
    }

    function executeForcedReset(uint8 _orderBookId, address _user, int256 _amount) external {
        IFutureValueVault(futureValueVaults[_orderBookId]).executeForcedReset(
            _orderBookId,
            _user,
            _amount
        );
    }

    function executeForcedReset(uint8 _orderBookId, address _user) external {
        IFutureValueVault(futureValueVaults[_orderBookId]).executeForcedReset(_orderBookId, _user);
    }
}
