// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IExternalAdapter {
    function createRequest(string memory _txHash) external returns (bytes32 requestId);

    function cancelRequest(
        string memory _txHash,
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
