// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@chainlink/contracts/src/v0.7/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainlinkSettlementAdaptor is managing requests to Chainlink for a settlement process.
 */
contract ChainlinkSettlementAdaptor is ChainlinkClient, Ownable {
    using Chainlink for Chainlink.Request;

    struct FulfillData {
        string from;
        string to;
        uint256 value;
        uint256 timestamp;
    }
    mapping(bytes32 => FulfillData) public results; // TODO: remove tmp data
    bytes32 public jobId;
    uint256 public requestFee;

    /**
     * @dev Contract constructor function.
     * @param _oracle The address of the oracle contract
     * @param _jobId The job id on the Cahinlink node
     * @param _requestFee The amount of LINK sent for the request
     * @param _link The address of the LINK token contract
     *
     * @notice `_link` is provided for development usage
     */
    constructor(
        address _oracle,
        bytes32 _jobId,
        uint256 _requestFee,
        address _link
    ) public Ownable() {
        setChainlinkOracle(_oracle);
        jobId = _jobId;

        requestFee = _requestFee;

        if (_link == address(0)) {
            setPublicChainlinkToken();
        } else {
            setChainlinkToken(_link);
        }
    }

    /**
     * @dev Gets contract address of the LINK token that is set at constructor
     *
     * @return address The address of the LINK token
     */
    function getChainlinkToken() public view returns (address) {
        return chainlinkTokenAddress();
    }

    /**
     * @dev Gets contract address of the oracle that is set at constructor
     *
     * @return address The address of the oracle contract
     */
    function getChainlinkOracle() public view returns (address) {
        return chainlinkOracleAddress();
    }

    /**
     * @dev Updates the stored oracle address
     * @param _oracle The address of the oracle contract
     */
    function updateChainlinkOracle(address _oracle) public onlyOwner {
        setChainlinkOracle(_oracle);
    }

    /**
     * @dev Updates the stored job id
     * @param _oracle The address of the oracle contract
     */
    function updateJobId(bytes32 _jobId) public onlyOwner {
        jobId = _jobId;
    }

    /**
     * @dev Updates the stored amount of LINK to send for the request
     * @param _oracle The address of the oracle contract
     */
    function updateRequestFee(uint256 _requestFee) public onlyOwner {
        requestFee = _requestFee;
    }

    /**
     * @dev Triggers to request the data from Chainlink External Adaptor.
     * This function specify a callback function name
     * @param _txHash The hash that is specify the data to get
     */
    // TODO: replace modifier for other contracts to call
    function createRequest(string memory _txHash)
        public
        onlyOwner
        returns (bytes32 requestId)
    {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );
        req.add("txHash", _txHash);
        requestId = sendChainlinkRequest(req, requestFee);
    }

    /**
     * @dev Triggers to cancell a request if it has not been fulfilled
     * @param _requestId The id to specify a request
     * @param _callbackFunc The callback function specified for the request
     * @param _expiration The time of the expiration for the request
     */
    function cancelRequest(
        bytes32 _requestId,
        bytes4 _callbackFunctionId,
        uint256 _expiration
    ) public onlyOwner {
        cancelChainlinkRequest(
            _requestId,
            requestFee,
            _callbackFunctionId,
            _expiration
        );
    }

    /**
     * @dev Triggers to receive the data from a job that is specified by `createRequestTo` function.
     * This function name is specified when `buildChainlinkRequest` is called
     * @param _requestId The id to specify a request
     * @param _from The from address of the data received
     * @param _to The to address of the data received
     * @param _value The value of the data received
     * @param _timestamp The timestamp of the data received
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
