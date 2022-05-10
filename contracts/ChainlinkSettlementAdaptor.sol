// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@chainlink/contracts/src/v0.7/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISettlementEngine.sol";
import "./interfaces/IExternalAdapterTxResponse.sol";

/**
 * @title ChainlinkSettlementAdapter is managing requests to Chainlink for a settlement process.
 */
contract ChainlinkSettlementAdapter is
    ChainlinkClient,
    Ownable,
    IExternalAdapterTxResponse
{
    using Chainlink for Chainlink.Request;

    mapping(string => bool) public isRequested;
    bytes32 public jobId;
    uint256 public requestFee;
    bytes32 public ccy;

    ISettlementEngine private settlementEngine;

    /**
     * @dev Contract constructor function.
     * @param _oracle The address of the oracle contract
     * @param _jobId The job id on the Chainlink node
     * @param _requestFee The amount of LINK sent for the request
     * @param _link The address of the LINK token contract
     *
     * @notice `_link` is provided for development usage
     */
    constructor(
        address _oracle,
        bytes32 _jobId,
        uint256 _requestFee,
        address _link,
        bytes32 _ccy,
        address _settlementEngine
    ) public Ownable() {
        setChainlinkOracle(_oracle);
        jobId = _jobId;
        ccy = _ccy;

        requestFee = _requestFee;

        settlementEngine = ISettlementEngine(_settlementEngine);

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
     * @param _jobId The job id on the Cahinlink node
     */
    function updateJobId(bytes32 _jobId) public onlyOwner {
        jobId = _jobId;
    }

    /**
     * @dev Updates the stored amount of LINK to send for the request
     * @param _requestFee The amount of LINK sent for the request
     */
    function updateRequestFee(uint256 _requestFee) public onlyOwner {
        requestFee = _requestFee;
    }

    /**
     * @dev Triggers to request the data from Chainlink External Adaptor.
     * This function specify a callback function name
     * @param _txHash The hash that is specify the data to get
     */
    function createRequest(string memory _txHash)
        public
        returns (bytes32 requestId)
    {
        _onlySettlementEngine();
        require(!isRequested[_txHash], "REQUEST_EXIST_ALREADY");
        isRequested[_txHash] = true;
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
     * @param _callbackFunctionId The callback function specified for the request
     * @param _expiration The time of the expiration for the request
     */
    function cancelRequest(
        bytes32 _requestId,
        bytes4 _callbackFunctionId,
        uint256 _expiration
    ) public onlyOwner {
        _onlySettlementEngine();
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
     * @param _txHash The hash of the data received
     */
    function fulfill(
        bytes32 _requestId,
        string calldata _from,
        string calldata _to,
        uint256 _value,
        uint256 _timestamp,
        string calldata _txHash
    ) public recordChainlinkFulfillment(_requestId) {
        FulfillData memory txData = FulfillData({
            from: _from,
            to: _to,
            value: _value,
            timestamp: _timestamp,
            txHash: _txHash
        });

        settlementEngine.fullfillSettlementRequest(_requestId, txData, ccy);
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

    function _onlySettlementEngine() internal {
        require(
            msg.sender == address(settlementEngine),
            "NOT_SETTLEMENT_ENGINE"
        );
    }
}
