// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";
import {ILendingMarket} from "../../protocol/interfaces/ILendingMarket.sol";
import {FilledOrder, PartiallyFilledOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

contract LendingMarketCaller {
    IBeaconProxyController public beaconProxyController;
    mapping(bytes32 => address) public lendingMarkets;
    mapping(bytes32 => uint8) public orderBookIds;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function getLendingMarket(bytes32 _ccy) external view returns (address) {
        return lendingMarkets[_ccy];
    }

    function getOrderBookId(bytes32 _ccy) external view returns (uint8) {
        return orderBookIds[_ccy];
    }

    function deployLendingMarket(bytes32 _ccy) external {
        lendingMarkets[_ccy] = beaconProxyController.deployLendingMarket(_ccy);
    }

    function createOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate
    ) external {
        orderBookIds[_ccy] = ILendingMarket(lendingMarkets[_ccy]).createOrderBook(
            _maturity,
            _openingDate
        );
    }

    function rotateOrderBooks(bytes32 _ccy, uint256 _newMaturity) external {
        ILendingMarket(lendingMarkets[_ccy]).rotateOrderBooks(_newMaturity);
    }

    function executeOrder(
        bytes32 _ccy,
        uint8 _orderBookId,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).executeOrder(
            _orderBookId,
            _side,
            msg.sender,
            _amount,
            _unitPrice,
            _circuitBreakerLimitRange
        );
    }

    function executePreOrder(
        bytes32 _ccy,
        uint8 _orderBookId,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).executePreOrder(
            _orderBookId,
            _side,
            msg.sender,
            _amount,
            _unitPrice
        );
    }

    function unwindPosition(
        bytes32 _ccy,
        uint8 _orderBookId,
        ProtocolTypes.Side _side,
        uint256 _futureValue,
        uint256 _circuitBreakerLimitRange
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).unwindPosition(
            _orderBookId,
            _side,
            msg.sender,
            _futureValue,
            _circuitBreakerLimitRange
        );
    }

    function executeItayoseCall(bytes32 _ccy, uint8 _orderBookId)
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory lendingOrder,
            PartiallyFilledOrder memory borrowingOrder
        )
    {
        return ILendingMarket(lendingMarkets[_ccy]).executeItayoseCall(_orderBookId);
    }

    function cleanUpOrders(
        bytes32 _ccy,
        uint8 _orderBookId,
        address _user
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).cleanUpOrders(_orderBookId, _user);
    }
}
