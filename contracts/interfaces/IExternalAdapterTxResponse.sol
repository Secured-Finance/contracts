// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <=0.7.0;
pragma experimental ABIEncoderV2;

interface IExternalAdapterTxResponse {
    struct FulfillData {
        string from;
        string to;
        uint256 value;
        uint256 timestamp;
        string txHash;
    }
}
