// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IExternalAdapterTxResponse {
    struct FulfillData {
        string from;
        string to;
        uint256 value;
        uint256 timestamp;
        string txHash;
    }
}
