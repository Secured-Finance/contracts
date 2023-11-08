// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// interfaces
import {ILendingMarket} from "../../protocol/interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

/**
 * @notice Implements a resolver contract of Gelato for the `executeItayoseCall` function.
 *
 * The Gelato task will call the `checker` function to check if the `executeItayoseCall` function can be executed.
 */
contract ItayoseCallResolver is MixinAddressResolver {
    constructor(address _resolver) {
        registerAddressResolver(_resolver);
        buildCache();
    }

    function checker(bytes32 _ccy) external view returns (bool canExec, bytes memory execPayload) {
        uint8[] memory orderBookId = lendingMarketController().getOrderBookIds(_ccy);
        uint8 lastOrderBookId = orderBookId[orderBookId.length - 1];
        address lendingMarket = lendingMarketController().getLendingMarket(_ccy);

        canExec = ILendingMarket(lendingMarket).isItayosePeriod(lastOrderBookId);
        execPayload = abi.encodeCall(
            ILendingMarketController.executeItayoseCall,
            (_ccy, lastOrderBookId)
        );
    }
}
