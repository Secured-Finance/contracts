// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {INativeToken} from "../../protocol/interfaces/INativeToken.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
import {IMockERC20} from "../tokens/IMockERC20.sol";

contract MockInfinityPool {
    uint256 private constant RATE_PRECISION = 1e18;

    IMockERC20 public immutable iFIL;
    INativeToken public immutable wFIL;
    uint256 public exchangeRate;
    bool public returnsWrappedToken;

    constructor(address _iFIL, address _wFIL, uint256 _exchangeRate) {
        iFIL = IMockERC20(_iFIL);
        wFIL = INativeToken(_wFIL);
        exchangeRate = _exchangeRate;
    }

    receive() external payable {}

    function setExchangeRate(uint256 _exchangeRate) external {
        exchangeRate = _exchangeRate;
    }

    function setReturnsWrappedToken(bool _returnsWrappedToken) external {
        returnsWrappedToken = _returnsWrappedToken;
    }

    function convertToShares(uint256 _assets) external view returns (uint256) {
        return (_assets * RATE_PRECISION) / exchangeRate;
    }

    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return (_shares * exchangeRate) / RATE_PRECISION;
    }

    function redeem(
        uint256 _shares,
        address _receiver,
        address _owner
    ) external returns (uint256 assets) {
        assets = convertToAssets(_shares);
        iFIL.burn(_owner, _shares);

        if (returnsWrappedToken) {
            wFIL.deposit{value: assets}();
            TransferHelper.safeTransfer(address(wFIL), _receiver, assets);
        } else {
            TransferHelper.safeTransferETH(_receiver, assets);
        }
    }
}
