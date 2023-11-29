// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";

contract BeaconProxyControllerCaller {
    IBeaconProxyController public beaconProxyController;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function deployFutureValueVault() external {
        beaconProxyController.deployFutureValueVault();
    }

    function deployLendingMarket(bytes32 ccy, uint256 orderFeeRate, uint256 cbLimitRange) external {
        beaconProxyController.deployLendingMarket(ccy, orderFeeRate, cbLimitRange);
    }
}
