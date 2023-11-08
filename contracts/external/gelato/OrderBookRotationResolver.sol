// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// interfaces
import {ILendingMarket} from "../../protocol/interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

/**
 * @notice Implements a resolver contract of Gelato for the `rotateOrderBooks` function.
 *
 * The Gelato task will call the `checker` function to check if the `rotateOrderBooks` function can be executed.
 */
contract OrderBookRotationResolver is MixinAddressResolver {
    constructor(address _resolver) {
        registerAddressResolver(_resolver);
        buildCache();
    }

    function checker(bytes32 _ccy) external view returns (bool canExec, bytes memory execPayload) {
        uint8 firstOrderBookId = lendingMarketController().getOrderBookIds(_ccy)[0];
        address lendingMarket = lendingMarketController().getLendingMarket(_ccy);

        canExec = ILendingMarket(lendingMarket).isMatured(firstOrderBookId);
        execPayload = abi.encodeCall(ILendingMarketController.rotateOrderBooks, (_ccy));
    }
}