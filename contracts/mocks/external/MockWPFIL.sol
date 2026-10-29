// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {MockERC20} from "../tokens/MockERC20.sol";
import {IMockERC20} from "../tokens/IMockERC20.sol";

contract MockWPFIL is MockERC20 {
    uint256 private constant RATE_PRECISION = 1e18;

    IMockERC20 public immutable pFIL;
    uint256 public exchangeRate;

    constructor(
        address _pFIL,
        uint256 _exchangeRate,
        uint256 _initialBalance
    ) MockERC20("Wrapped PFIL", "wpFIL", _initialBalance) {
        pFIL = IMockERC20(_pFIL);
        exchangeRate = _exchangeRate;
    }

    function setExchangeRate(uint256 _exchangeRate) external {
        exchangeRate = _exchangeRate;
    }

    function getPFILByWPFIL(uint256 _wpFILAmount) public view returns (uint256) {
        return (_wpFILAmount * exchangeRate) / RATE_PRECISION;
    }

    function unwrap(uint256 _wpFILAmount) external returns (uint256 pFILAmount) {
        pFILAmount = getPFILByWPFIL(_wpFILAmount);
        _burn(msg.sender, _wpFILAmount);
        pFIL.mint(msg.sender, pFILAmount);
    }
}
