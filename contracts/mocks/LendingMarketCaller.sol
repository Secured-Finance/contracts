// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IBeaconProxyController} from "../interfaces/IBeaconProxyController.sol";
import {ILendingMarket} from "../interfaces/ILendingMarket.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";

contract LendingMarketCaller {
    IBeaconProxyController public beaconProxyController;
    address[] public lendingMarkets;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function getLendingMarkets() external view returns (address[] memory) {
        return lendingMarkets;
    }

    function deployLendingMarket(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate
    ) external {
        address lendingMarket = beaconProxyController.deployLendingMarket(
            _ccy,
            _maturity,
            _openingDate
        );
        lendingMarkets.push(lendingMarket);
    }

    function createPreOrder(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _index
    ) external {
        ILendingMarket(lendingMarkets[_index]).createPreOrder(
            _side,
            msg.sender,
            _amount,
            _unitPrice
        );
    }

    function executeItayoseCall(uint256 _index)
        external
        returns (
            uint256 openingUnitPrice,
            uint256 openingDate,
            ILendingMarket.PartiallyFilledOrder memory lendingOrder,
            ILendingMarket.PartiallyFilledOrder memory borrowingOrder
        )
    {
        return ILendingMarket(lendingMarkets[_index]).executeItayoseCall();
    }
}
