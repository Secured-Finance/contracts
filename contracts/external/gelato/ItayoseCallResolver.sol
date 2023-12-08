// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// interfaces
import {ILendingMarket} from "../../protocol/interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
// libraries
import {Contracts} from "../../protocol/libraries/Contracts.sol";
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

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function checker(bytes32 _ccy) external view returns (bool canExec, bytes memory execPayload) {
        uint256[] memory maturities = lendingMarketController().getMaturities(_ccy);
        address lendingMarket = lendingMarketController().getLendingMarket(_ccy);

        for (uint256 i; i < maturities.length; i++) {
            bool isItayosePeriod = ILendingMarket(lendingMarket).isItayosePeriod(maturities[i]);

            if (isItayosePeriod) {
                return (
                    true,
                    abi.encodeCall(
                        ILendingMarketController.executeItayoseCall,
                        (_ccy, maturities[i])
                    )
                );
            }
        }

        return (false, bytes("Not Itayose Period"));
    }
}
