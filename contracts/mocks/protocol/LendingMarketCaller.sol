// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IBeaconProxyController} from "../../protocol/interfaces/IBeaconProxyController.sol";
import {ILendingMarket} from "../../protocol/interfaces/ILendingMarket.sol";
import {FilledOrder, PartiallyFilledOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

contract LendingMarketCaller {
    IBeaconProxyController public beaconProxyController;
    mapping(bytes32 => address) public lendingMarkets;
    mapping(bytes32 => uint256) public maturityLists;

    constructor(address _beaconProxyController) {
        beaconProxyController = IBeaconProxyController(_beaconProxyController);
    }

    function getLendingMarket(bytes32 _ccy) external view returns (address) {
        return lendingMarkets[_ccy];
    }

    function getMaturity(bytes32 _ccy) external view returns (uint256) {
        return maturityLists[_ccy];
    }

    function deployLendingMarket(
        bytes32 _ccy,
        uint256 _orderFeeRate,
        uint256 _limitRange
    ) external {
        lendingMarkets[_ccy] = beaconProxyController.deployLendingMarket(
            _ccy,
            _orderFeeRate,
            _limitRange
        );
    }

    function createOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate,
        uint256 _preOpeningDate
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).createOrderBook(
            _maturity,
            _openingDate,
            _preOpeningDate
        );
    }

    function executeAutoRoll(
        bytes32 _ccy,
        uint256 _maturedOrderBookMaturity,
        uint256 _destinationOrderBookMaturity,
        uint256 _autoRollUnitPrice
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).executeAutoRoll(
            _maturedOrderBookMaturity,
            _destinationOrderBookMaturity,
            _autoRollUnitPrice
        );
    }

    function executeOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).executeOrder(
            _maturity,
            _side,
            msg.sender,
            _amount,
            _unitPrice
        );
    }

    function executePreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).executePreOrder(
            _maturity,
            _side,
            msg.sender,
            _amount,
            _unitPrice
        );
    }

    function unwindPosition(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _futureValue
    ) external {
        ILendingMarket(lendingMarkets[_ccy]).unwindPosition(
            _maturity,
            _side,
            msg.sender,
            _futureValue
        );
    }

    function cancelOrder(bytes32 _ccy, uint256 _maturity, address _user, uint48 _orderId) external {
        ILendingMarket(lendingMarkets[_ccy]).cancelOrder(_maturity, _user, _orderId);
    }

    function executeItayoseCall(
        bytes32 _ccy,
        uint256 _maturity
    )
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory lendingOrder,
            PartiallyFilledOrder memory borrowingOrder
        )
    {
        return ILendingMarket(lendingMarkets[_ccy]).executeItayoseCall(_maturity);
    }

    function cleanUpOrders(bytes32 _ccy, uint256 _maturity, address _user) external {
        ILendingMarket(lendingMarkets[_ccy]).cleanUpOrders(_maturity, _user);
    }

    function pause(bytes32 _ccy) external {
        ILendingMarket(lendingMarkets[_ccy]).pause();
    }

    function unpause(bytes32 _ccy) external {
        ILendingMarket(lendingMarkets[_ccy]).unpause();
    }
}
