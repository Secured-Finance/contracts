// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

contract Loan {
  
    // (Execution)
    // 1. Deploy from market taker (maker addr, side, ccy, term, size)
    // 2. Check collateral coverage and state
    // 3. If loan size is ok, delete one item from MoneyMarket
    // 4. loan state DEPLOYED
    // 5. Emit message LoanDeployed or UpSize
    // 6. Input FIL txHash and emit FIL FundArrived
    // 7. taker manually check Filecoin network
    // 8. taker confirmLoanAmount and make loan state BEGIN and emit LoanBegin
    // 9. change collateral state to IN_USE and emit message CollateralInUse

    // (Liquidation)
    // 10. Market Maker Input FIL txHash for Liquidation
    // 11. Emit message FILReturned
    // 12. Lender verify the FIL amount and make collateral state EMPTY(0) or NEW(>0)
    // 13. If no verification, other market maker will veiry and get fees
    // 14. Release 120% collateral to Market Maker
    // 15. Reserve 5% in Collateral contract and update loan state TERMINATED
    // 16. Emit message LoanTerminated
}
