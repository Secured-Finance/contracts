// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library LoanV2Storage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.loanV2");

    struct LoanDeal {
        address lender;
        address borrower;
        bytes32 ccy;
        uint256 term;
        uint256 notional;
        uint256 rate;
        uint256 start;
        uint256 end;
        uint256 pv;
        bytes32 startTxHash;
    }

    struct Termination {
        address terminationAsker;
        uint256 terminationDate;
    }
    struct Storage {
        uint8 paymentFrequency;
        // Mapping for all storing LoanDeals per loanIDs.
        mapping(bytes32 => LoanDeal) loans;
        mapping(bytes32 => Termination) terminations;
        mapping(bytes32 => bool) isSettled;
        bool isTransferable;
        uint256 lastLoanId;
        mapping(bytes32 => mapping(uint256 => address)) lendingMarkets;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
