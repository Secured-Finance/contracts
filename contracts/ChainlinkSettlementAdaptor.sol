// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@chainlink/contracts/src/v0.7/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev ChainlinkSettlementAdaptor contract is managing requests for Chainlink
 * This contract is triggered by another contract to send a request to Chainlink.
 */
contract ChainlinkSettlementAdaptor is ChainlinkClient, Ownable {
    using Chainlink for Chainlink.Request;

    struct FulfillData {
        string from;
        string to;
        uint256 value;
        uint256 timestamp;
    }
    // TODO: remove tmp data
    mapping(bytes32 => FulfillData) public results;

    /**
     * @dev Contract constructor function.
     * @param _link contract address of LINK Token
     *
     * @notice `_link` is provided for development usage
     */
    constructor(address _link) public Ownable() {
        if (_link == address(0)) {
            setPublicChainlinkToken();
        } else {
            setChainlinkToken(_link);
        }
    }

    /**
     * @dev Triggers to get contract address of LINK Token that is set at constructor
     *
     * @return address LINK Token address
     */
    function getChainlinkToken() public view returns (address) {
        return chainlinkTokenAddress();
    }

    /**
     * @dev Triggers to request the data from Chainlink External Adaptor.
     * The function name is specified when `buildChainlinkRequest` is called
     * @param _oracle oracle contract address
     * @param _jobId job id on the Cahinlink node
     * @param _payment amount of LIKE Token to pay
     * @param _messageId id that is the key to get data
     */
    // TODO: replace modifier for other contracts to call
    function createRequestTo(
        address _oracle,
        bytes32 _jobId,
        uint256 _payment,
        string memory _messageId
    ) public onlyOwner returns (bytes32 requestId) {
        Chainlink.Request memory req = buildChainlinkRequest(
            _jobId,
            address(this),
            this.fulfill.selector
        );
        req.add("messageId", _messageId);
        requestId = sendChainlinkRequestTo(_oracle, req, _payment);
    }

    function cancelRequest(
        bytes32 _requestId,
        uint256 _payment,
        bytes4 _callbackFunctionId,
        uint256 _expiration
    ) public onlyOwner {
        cancelChainlinkRequest(
            _requestId,
            _payment,
            _callbackFunctionId,
            _expiration
        );
    }

    /**
     * @dev Triggers to receive the data from a job that is specified by `createRequestTo` function.
     * The function name is specified when `buildChainlinkRequest` is called
     * @param _requestId id to specify a request
     * @param _from from address of the specific message
     * @param _to to address of the specific message
     * @param _value value of the specific message
     * @param _timestamp timestamp of the specific message
     */
    function fulfill(
        bytes32 _requestId,
        string calldata _from,
        string calldata _to,
        uint256 _value,
        uint256 _timestamp
    ) public recordChainlinkFulfillment(_requestId) {
        results[_requestId] = FulfillData({
            from: _from,
            to: _to,
            value: _value,
            timestamp: _timestamp
        });
        // TODO: verify payment here
    }

    /**
     * @dev Triggers to withdraw LINK Token.
     * LINK token is needed to hold by this contract to use the Chainlink
     */
    function withdrawLink() public onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
