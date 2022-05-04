// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IExternalAdapter {
    function createRequest(string memory _txHash)
        external
        returns (bytes32 requestId);

    function cancelRequest(
        bytes32 _requestId,
        bytes4 _callbackFunctionId,
        uint256 _expiration
    ) external;

    function fulfill(
        bytes32 _requestId,
        string calldata _from,
        string calldata _to,
        uint256 _value,
        uint256 _timestamp
    ) external;
}
