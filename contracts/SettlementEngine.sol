// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./libraries/Strings.sol";
import "./libraries/SafeTransfer.sol";
import "./interfaces/IExternalAdapter.sol";
import "./interfaces/ISettlementEngine.sol";
import "./interfaces/IExternalAdapterTxResponse.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/Ownable.sol";
import "./utils/Proxyable.sol";
import "./types/ProtocolTypes.sol";
import {SettlementEngineStorage as Storage} from "./storages/SettlementEngineStorage.sol";

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
    MixinAddressResolver,
    SafeTransfer,
    Ownable,
    Proxyable
{
    using Address for address;
    using Strings for string;

    uint16 private constant VERSION = 1;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address owner,
        address resolver,
        address WETH9
    ) public initializer onlyProxy {
        _transferOwnership(owner);
        _registerToken(WETH9);
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.CROSSCHAIN_ADDRESS_RESOLVER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.PAYMENT_AGGREGATOR;
    }

    /**
     * @dev Triggers to add new external adapter for specific `_ccy`
     * @param _adapter External adapter contract address
     * @param _ccy Short identifier of a currency
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addExternalAdapter(address _adapter, bytes32 _ccy) public override onlyOwner {
        require(_adapter.isContract(), "NOT_CONTRACT");
        require(currencyController().isSupportedCcy(_ccy), "NON_SUPPORTED_CCY");

        uint16 chainId = currencyController().getChainId(_ccy);
        require(chainId != 60, "NOT_ANOTHER_CHAIN");

        Storage.slot().externalAdapters[chainId] = _adapter;

        emit ExternalAdapterAdded(_adapter, _ccy);
    }

    /**
     * @dev Triggers to get external adapter for specific currency.
     * @param _ccy Short identifier of a currency
     */
    function getExternalAdapters(bytes32 _ccy) external view returns (address) {
        uint16 chainId = currencyController().getChainId(_ccy);
        return Storage.slot().externalAdapters[chainId];
    }

    /**
     * @dev Triggers to get settlement request
     * @param _requestId The id to specify a request
     */
    function getSettlementRequests(bytes32 _requestId)
        external
        view
        returns (ProtocolTypes.SettlementRequest memory)
    {
        return Storage.slot().settlementRequests[_requestId];
    }

    /**
     * @dev External function to verify payment by msg.sender as a part of a settlement process
     * It could validate either a cross-chain settlement or native settlement
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
        uint16 chainId = currencyController().getChainId(_ccy);
        bytes32 requestId;

        require(
            !paymentAggregator().isSettled(msg.sender, _counterparty, _ccy, _timestamp),
            "TIMESLOT_SETTLED_ALREADY"
        );

        if (chainId == 60) {
            _performNativeSettlement(msg.sender, _counterparty, _ccy, _payment, _timestamp);
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
     * @dev External function to fulfill cross-chain settlement request.
     * Expects to get transaction object to validate the correct settlement values
     * on the PaymentAggregator contract level
     * @param _txData Transaction object from external adapter
     * @param _ccy Main currency of the external adapter
     *
     * @notice Triggers only be external adapter for specific chain
     */
    function fulfillSettlementRequest(
        bytes32 _requestId,
        FulfillData memory _txData,
        bytes32 _ccy
    ) external override {
        uint16 chainId = currencyController().getChainId(_ccy);
        require(Storage.slot().externalAdapters[chainId] == msg.sender, "NOT_EXTERNAL_ADAPTER");

        ProtocolTypes.SettlementRequest memory request = Storage.slot().settlementRequests[
            _requestId
        ];
        _validateSettlementRequest(chainId, request, _txData);

        bytes32 _settlementId = keccak256(abi.encodePacked(_txData.txHash));

        paymentAggregator().verifyPayment(
            request.payer,
            request.receiver,
            _ccy,
            request.timestamp,
            _txData.value,
            _settlementId
        );

        emit CrosschainSettlementRequestFulfilled(
            _txData.from,
            _txData.to,
            chainId,
            _txData.value,
            _txData.timestamp,
            _txData.txHash,
            _settlementId
        );

        delete Storage.slot().settlementRequests[_requestId];
    }

    // TODO: Add cancel external adapter request function

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
        require(paymentAggregator().checkSettlementWindow(_timestamp), "OUT_OF_SETTLEMENT_WINDOW");

        address adapterAddr = Storage.slot().externalAdapters[_chainId];
        require(adapterAddr != address(0), "ADAPTER_DOESN'T_EXIST");
        IExternalAdapter adapter = IExternalAdapter(adapterAddr);

        bytes32 requestId = adapter.createRequest(_txHash);
        // TODO: make sure we're not duplicating requests with the same txHashes
        // on external adapter contract

        Storage.slot().settlementRequests[requestId] = ProtocolTypes.SettlementRequest({
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
            address token = currencyController().getTokenAddresses(_ccy);
            require(token != address(0), "INVALID_TOKEN_ADDRESS");
            _safeTransferFrom(token, _payer, _counterparty, _payment);
        }

        bytes32 _settlementId = keccak256(
            abi.encodePacked(_payer, _counterparty, _ccy, _payment, _timestamp)
        );

        paymentAggregator().verifyPayment(
            _payer,
            _counterparty,
            _ccy,
            _timestamp,
            _payment,
            _settlementId
        );
    }

    /**
     * @dev Internal function to cross-chain settlement request against
     * a transaction object from an external adapter
     */
    function _validateSettlementRequest(
        uint16 _chainId,
        ProtocolTypes.SettlementRequest memory _request,
        FulfillData memory _txData
    ) internal view {
        require(_request.txHash.isEqual(_txData.txHash), "INCORRECT_TX_HASH");

        string memory payerAddress = crosschainAddressResolver().getUserAddress(
            _request.payer,
            _chainId
        );

        string memory receiverAddress = crosschainAddressResolver().getUserAddress(
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
    function getVersion() public pure override returns (uint16) {
        return VERSION;
    }
}
