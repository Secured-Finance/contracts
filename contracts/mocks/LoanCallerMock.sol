// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";
import "../interfaces/ILoanV2.sol";

contract LoanCallerMock is ProtocolTypes {

    ILoanV2 public loan;

    constructor(address _loan) public {
        loan = ILoanV2(_loan);
    }
    
    function register(
        address maker,
        address taker,
        uint8 side,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate
    ) public returns (bytes32 loanId) {
        return loan.register(maker, taker, side, ccy, term, notional, rate);
    }
}
