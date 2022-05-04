// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <=0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./libraries/Strings.sol";
import "./libraries/SafeTransfer.sol";
import "./interfaces/IExternalAdapter.sol";
import "./interfaces/ISettlementEngine.sol";
import "./interfaces/ICurrencyController.sol";
import "./interfaces/ILiquidations.sol";
import "./interfaces/IPaymentAggregator.sol";
import "./interfaces/ICrosschainAddressResolver.sol";
import "./interfaces/IExternalAdapterTxResponse.sol";

/**
 * @title Settlement Engine contract is used in settlement operations
 * of the Secured Finance protocol. Settlement is divided per 1 calendar
 * day and verified by either external adapters (for cross-chain transaction)
 * or native ETH-chain settlement.
 *
 * Contract linked to the PaymentAggregator contract and all External Adapters per target chain.
 */
contract SettlementEngine is
    ISettlementEngine,
    IExternalAdapterTxResponse,
    SafeTransfer
{
    using SafeMath for uint256;
    using Address for address;
    using Strings for string;
    using Strings for bytes32;

    struct SettlementRequest {
        address payer;
        address receiver;
        uint16 chainId;
        uint256 timestamp;
        string txHash;
    }

    address public override owner;
    uint16 private constant VERSION = 1;

    ICurrencyController private currencyController;
    ILiquidations private liquidationEngine;
    IPaymentAggregator private paymentAggregator;
    ICrosschainAddressResolver private crosschainResolver;

    // Mapping to external providers addresses by Chain Ids
    // for ETH-based currencies there is no need for external adapters
    mapping(uint16 => address) public override externalAdapters;

    // Mapping of cross-chain settlement requests per requestId
    mapping(bytes32 => SettlementRequest) public override settlementRequests;

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "INVALID_ACCESS");
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     */
    constructor(
        address _paymentAggregator,
        address _currencyController,
        address _crosschainResolver,
        address _WETH9
    ) public SafeTransfer(_WETH9) {
        owner = msg.sender;

        paymentAggregator = IPaymentAggregator(_paymentAggregator);
        currencyController = ICurrencyController(_currencyController);
        crosschainResolver = ICrosschainAddressResolver(_crosschainResolver);
    }

    /**
     * @dev Trigers to add new external adapter for specific `_ccy`
     * @param _adapter External adapter contract address
     * @param _ccy Short identifier of a currency
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addExternalAdapter(address _adapter, bytes32 _ccy)
        public
        override
        onlyOwner
    {
        require(_adapter.isContract(), "NOT_CONTRACT");
        require(currencyController.isSupportedCcy(_ccy), "NON_SUPPORTED_CCY");

        uint16 chainId = currencyController.getChainId(_ccy);
        require(chainId != 0, "NOT_ANOTHER_CHAIN");
        require(
            externalAdapters[chainId] == address(0),
            "CAN'T_REPLACE_EXTERNAL_ADAPTER"
        );

        externalAdapters[chainId] = _adapter;

        emit ExternalAdapterAdded(_adapter, _ccy);
    }

    /**
     * @dev Trigers to replace existing external adapter for specific `_ccy`
     * @param _adapter External adapter contract address
     * @param _ccy Short identifier of a currency
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function replaceExternalAdapter(address _adapter, bytes32 _ccy)
        public
        override
        onlyOwner
    {
        require(_adapter.isContract(), "NOT_CONTRACT");
        uint16 chainId = currencyController.getChainId(_ccy);

        require(
            externalAdapters[chainId] != address(0),
            "ADAPTER_DOESN'T_EXIST"
        );

        externalAdapters[chainId] = _adapter;

        emit ExternalAdapterUpdated(_adapter, _ccy);
    }

    /**
     * @dev External function to verify payment by msg.sender as a part of a settlement process
     * It could validate either a cross-chain settlment or native settlement
     * @param _counterparty Counterparty address
     * @param _ccy Main payment settlement currency
     * @param _payment Payment amount in currency
     * @param _timestamp Timeslot timestamp for settlement operation
     * @param _txHash Cross-chain transfer txHash
     */
    function verifyPayment(
        address _counterparty,
        bytes32 _ccy,
        uint256 _payment,
        uint256 _timestamp,
        string memory _txHash
    ) external payable override returns (bytes32) {
        // TODO: add a way for third party to trigger ERC20 approved coupon payments
        uint16 chainId = currencyController.getChainId(_ccy);
        bytes32 requestId;

        require(
            !paymentAggregator.isSettled(
                msg.sender,
                _counterparty,
                _ccy,
                _timestamp
            ),
            "TIMESLOT_SETTLED_ALREADY"
        );

        if (chainId == 0) {
            _performNativeSettlement(
                msg.sender,
                _counterparty,
                _ccy,
                _payment,
                _timestamp
            );
        } else {
            requestId = _performCrosschainSettlement(
                msg.sender,
                _counterparty,
                chainId,
                _timestamp,
                _txHash
            );
        }

        return requestId;
    }

    /**
     * @dev External function to fullfill cross-chain settlement request.
     * Expects to get transaction object to validate the correct settlement values
     * on the PaymentAggregator contract level
     * @param _txData Transaction object from external adapter
     * @param _ccy Main currency of the external adapter
     *
     * @notice Trigers only be external adapter for specific chain
     */
    function fullfillSettlementRequest(
        bytes32 _requestId,
        FulfillData memory _txData,
        bytes32 _ccy
    ) external override {
        uint16 chainId = currencyController.getChainId(_ccy);
        require(
            externalAdapters[chainId] == msg.sender,
            "NOT_EXTERNAL_ADAPTER"
        );

        SettlementRequest memory request = settlementRequests[_requestId];
        _validateSettlementRequest(chainId, request, _txData);

        paymentAggregator.verifyPayment(
            request.payer,
            request.receiver,
            _ccy,
            request.timestamp,
            _txData.value,
            _txData.txHash
        );

        delete settlementRequests[_requestId];
    }

    /**
     * @dev Internal function to create a settlement validation request for an external adapter
     * @param _payer Payer of the settlement transfer
     * @param _counterparty Receiver of the settlement transfer
     * @param _chainId Target chain id
     * @param _txHash Target chain transaction hash
     */
    function _performCrosschainSettlement(
        address _payer,
        address _counterparty,
        uint16 _chainId,
        uint256 _timestamp,
        string memory _txHash
    ) internal returns (bytes32) {
        require(msg.value == 0, "INCORRECT_ETH_VALUE");
        address adapterAddr = externalAdapters[_chainId];
        require(adapterAddr != address(0), "ADAPTER_DOESN'T_EXIST");
        IExternalAdapter adapter = IExternalAdapter(adapterAddr);

        bytes32 requestId = adapter.createRequest(_txHash);
        // TODO: make sure we're not duplicating requests with the same txHashes
        // on external adapter contract

        settlementRequests[requestId] = SettlementRequest({
            payer: _payer,
            receiver: _counterparty,
            chainId: _chainId,
            timestamp: _timestamp,
            txHash: _txHash
        });

        emit CrosschainSettlementRequested(
            _payer,
            _counterparty,
            _chainId,
            _timestamp,
            _txHash,
            requestId
        );

        return requestId;
    }

    /**
     * @dev Internal function to settle payments on native ETH-based settlement.
     * If currency is a ERC20 token it would transfer the `_payment` amount of tokens
     * from msg.sender to `_counterparty` address.
     * If currency is ETH, native Ether would be transfered accordingly
     *
     * @param _payer Payment sender address
     * @param _counterparty Payment receiver address
     * @param _ccy Main payment settlement currency
     * @param _payment Payment amount in currency
     */
    function _performNativeSettlement(
        address _payer,
        address _counterparty,
        bytes32 _ccy,
        uint256 _payment,
        uint256 _timestamp
    ) internal {
        if (_ccy == "ETH") {
            require(msg.value == _payment, "INCORRECT_ETH_VALUE");
            _safeTransferETH(_counterparty, msg.value);
        } else {
            require(msg.value == 0, "INCORRECT_ETH_VALUE");
            address token = currencyController.tokenAddresses(_ccy);
            require(token != address(0), "INVALID_TOKEN_ADDRESS");
            _safeTransferFrom(token, _payer, _counterparty, _payment);
        }

        string memory _hash = keccak256(
            abi.encodePacked(_payer, _counterparty, _ccy, _payment, _timestamp)
        ).toHex();

        paymentAggregator.verifyPayment(
            _payer,
            _counterparty,
            _ccy,
            _timestamp,
            _payment,
            _hash
        );
    }

    /**
     * @dev Internal function to cross-chain settlement request against
     * a transaction object from an external adapter
     */
    function _validateSettlementRequest(
        uint16 _chainId,
        SettlementRequest memory _request,
        FulfillData memory _txData
    ) internal view returns (bool) {
        require(_request.txHash.isEqual(_txData.txHash), "INCORRECT_TX_HASH");

        string memory payerAddress = crosschainResolver.getUserAddress(
            _request.payer,
            _chainId
        );

        string memory receiverAddress = crosschainResolver.getUserAddress(
            _request.receiver,
            _chainId
        );

        require(payerAddress.isEqual(_txData.from), "INCORRECT_ADDRESS_FROM");
        require(receiverAddress.isEqual(_txData.to), "INCORRECT_ADDRESS_TO");
    }

    /**
     * @dev Get the version of the underlying contract
     * @return implementation version
     */
    function getVersion() public view override returns (uint16) {
        return VERSION;
    }
}
