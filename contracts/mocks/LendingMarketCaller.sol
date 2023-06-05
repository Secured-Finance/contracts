// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IBeaconProxyController} from "../protocol/interfaces/IBeaconProxyController.sol";
import {ILendingMarket} from "../protocol/interfaces/ILendingMarket.sol";
import {ProtocolTypes} from "../protocol/types/ProtocolTypes.sol";

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

    function openMarket(
        uint256 _maturity,
        uint256 _openingDate,
        uint256 _index
    ) external {
        ILendingMarket(lendingMarkets[_index]).openMarket(_maturity, _openingDate);
    }

    function createOrder(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange,
        uint256 _index
    ) external {
        ILendingMarket(lendingMarkets[_index]).createOrder(
            _side,
            msg.sender,
            _amount,
            _unitPrice,
            _circuitBreakerLimitRange
        );
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

    function unwind(
        ProtocolTypes.Side _side,
        uint256 _futureValue,
        uint256 _circuitBreakerLimitRange,
        uint256 _index
    ) external {
        ILendingMarket(lendingMarkets[_index]).unwind(
            _side,
            msg.sender,
            _futureValue,
            _circuitBreakerLimitRange
        );
    }

    function executeItayoseCall(uint256 _index)
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            ILendingMarket.PartiallyFilledOrder memory lendingOrder,
            ILendingMarket.PartiallyFilledOrder memory borrowingOrder
        )
    {
        return ILendingMarket(lendingMarkets[_index]).executeItayoseCall();
    }
}
