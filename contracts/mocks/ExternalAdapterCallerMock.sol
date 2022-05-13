// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";
import "../interfaces/IExternalAdapterTxResponse.sol";
import "../interfaces/IExternalAdapter.sol";

contract ExternalAdapterCallerMock is IExternalAdapterTxResponse {
    IExternalAdapter private adapter;

    function setExternalAdapter(address _adapter) public {
        require(_adapter != address(0), "Zero address");
        adapter = IExternalAdapter(_adapter);
    }

    function createRequest(string memory txHash)
        public
        returns (bytes32 loanId)
    {
        return adapter.createRequest(txHash);
    }

    function cancelRequest(
        string memory _txHash,
        bytes32 _requestId,
        bytes4 _callbackFunctionId,
        uint256 _expiration
    ) public {
        return
            adapter.cancelRequest(
                _txHash,
                _requestId,
                _callbackFunctionId,
                _expiration
            );
    }

    function fullfillSettlementRequest(
        bytes32 _requestId,
        FulfillData memory _txData,
        bytes32 _ccy
    ) external pure {
        return;
    }
}
