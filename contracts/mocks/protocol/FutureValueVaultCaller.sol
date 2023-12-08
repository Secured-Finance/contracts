// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";
import {IFutureValueVault} from "../../protocol/interfaces/IFutureValueVault.sol";
import {FilledOrder, PartiallyFilledOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

contract FutureValueVaultCaller {
    IBeaconProxyController public beaconProxyController;
    address futureValueVault;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function getFutureValueVault() external view returns (address) {
        return futureValueVault;
    }

    function deployFutureValueVault() external {
        futureValueVault = beaconProxyController.deployFutureValueVault();
    }

    function increase(uint256 _maturity, address _user, uint256 _amount) external {
        IFutureValueVault(futureValueVault).increase(_maturity, _user, _amount);
    }

    function decrease(uint256 _maturity, address _user, uint256 _amount) external {
        IFutureValueVault(futureValueVault).decrease(_maturity, _user, _amount);
    }

    function transferFrom(
        uint256 _maturity,
        address _sender,
        address _receiver,
        int256 _amount
    ) external {
        IFutureValueVault(futureValueVault).transferFrom(_maturity, _sender, _receiver, _amount);
    }

    function executeForcedReset(uint256 _maturity, address _user, int256 _amount) external {
        IFutureValueVault(futureValueVault).executeForcedReset(_maturity, _user, _amount);
    }

    function executeForcedReset(uint256 _maturity, address _user) external {
        IFutureValueVault(futureValueVault).executeForcedReset(_maturity, _user);
    }
}
