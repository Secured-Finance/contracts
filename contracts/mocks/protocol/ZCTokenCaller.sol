// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";
import {IZCToken} from "../../protocol/interfaces/IZCToken.sol";
import {FilledOrder, PartiallyFilledOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

contract ZCTokenCaller {
    IBeaconProxyController public beaconProxyController;
    address public zcToken;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function deployZCToken(
        string memory name,
        string memory symbol,
        address asset,
        uint256 maturity
    ) external {
        zcToken = beaconProxyController.deployZCToken(name, symbol, asset, maturity);
    }

    function mint(address to, uint256 amount) external {
        IZCToken(zcToken).mint(to, amount);
    }

    function burn(address to, uint256 amount) external {
        IZCToken(zcToken).burn(to, amount);
    }
}
