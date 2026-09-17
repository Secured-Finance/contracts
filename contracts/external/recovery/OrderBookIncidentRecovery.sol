// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IERC20} from "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "../../dependencies/openzeppelin/security/ReentrancyGuard.sol";
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../../protocol/interfaces/ITokenVault.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";
import {Ownable} from "../../protocol/utils/Ownable.sol";

interface IPausable {
    function paused() external view returns (bool);
}

/**
 * @notice Executes the one-time correction for orders affected by the order-book incident.
 * @dev This contract must receive OPERATOR_ROLE on LendingMarketController and TokenVault.
 * It intentionally has no arbitrary-call or asset-rescue function. Revoke both roles after use.
 */
contract OrderBookIncidentRecovery is Ownable, ReentrancyGuard {
    uint256 public constant MAX_CORRECTIONS_PER_BATCH = 50;

    ILendingMarketController public immutable lendingMarketController;
    ITokenVault public immutable tokenVault;
    address public immutable nativeToken;

    mapping(bytes32 batchId => bool executed) public executedBatches;
    mapping(bytes32 correctionId => bool executed) public executedCorrections;
    mapping(bytes32 transferId => bool executed) public executedAssetTransfers;

    struct Correction {
        bytes32 correctionId;
        uint256 maturity;
        ProtocolTypes.Side side;
        uint256 amount;
        uint256 unitPrice;
    }

    error InvalidAddress();
    error InvalidRecoveryId();
    error InvalidCorrectionCount(uint256 count);
    error RecoveryAlreadyExecuted(bytes32 recoveryId);
    error ProtocolNotPaused(address target);
    error InvalidMsgValue(uint256 expected, uint256 actual);
    error UnexpectedAssetBalance(uint256 expected, uint256 actual);
    error UnexpectedAllowance(uint256 actual);

    event CorrectionExecuted(
        bytes32 indexed batchId,
        bytes32 indexed correctionId,
        address indexed user,
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    );

    event CorrectionBatchExecuted(
        bytes32 indexed batchId,
        address indexed user,
        bytes32 indexed ccy,
        address fundingSource,
        uint256 fundingAmount,
        uint256 correctionCount
    );

    constructor(
        address _lendingMarketController,
        address _tokenVault,
        address _nativeToken,
        address _owner
    ) {
        if (
            _lendingMarketController == address(0) ||
            _tokenVault == address(0) ||
            _nativeToken == address(0) ||
            _owner == address(0)
        ) revert InvalidAddress();

        lendingMarketController = ILendingMarketController(_lendingMarketController);
        tokenVault = ITokenVault(_tokenVault);
        nativeToken = _nativeToken;
        _transferOwnership(_owner);
    }

    /**
     * @notice Applies offsetting fills for one user and currency.
     * @param _fundingAmount Net asset shortfall to deposit, not the gross corrected PV.
     */
    function executeCorrections(
        bytes32 _batchId,
        address _user,
        bytes32 _ccy,
        uint256 _fundingAmount,
        Correction[] calldata _corrections
    ) external payable onlyOwner nonReentrant {
        if (_batchId == bytes32(0)) revert InvalidRecoveryId();
        if (_user == address(0)) revert InvalidAddress();
        if (executedBatches[_batchId]) revert RecoveryAlreadyExecuted(_batchId);

        uint256 correctionCount = _corrections.length;
        if (correctionCount == 0 || correctionCount > MAX_CORRECTIONS_PER_BATCH) {
            revert InvalidCorrectionCount(correctionCount);
        }

        if (!IPausable(address(tokenVault)).paused()) {
            revert ProtocolNotPaused(address(tokenVault));
        }
        (address token, uint256 balanceBefore) = _prepareFunding(_ccy, _fundingAmount);

        executedBatches[_batchId] = true;
        for (uint256 i; i < correctionCount; ++i) {
            bytes32 correctionId = _corrections[i].correctionId;
            if (correctionId == bytes32(0)) revert InvalidRecoveryId();
            if (executedCorrections[correctionId]) {
                revert RecoveryAlreadyExecuted(correctionId);
            }
            executedCorrections[correctionId] = true;
        }

        lendingMarketController.cancelOrdersForRecovery(_ccy, _user);

        // Restore every pending amount omitted by the incident before deposit-triggered cleanup.
        // Cleanup consumes only amounts backed by inactive orders; already-cleaned amounts remain.
        for (uint256 i; i < correctionCount; ++i) {
            Correction calldata correction = _corrections[i];
            lendingMarketController.addPendingOrderAmountForRecovery(
                _ccy,
                correction.maturity,
                correction.amount
            );
        }

        tokenVault.unpause();
        if (_fundingAmount != 0) {
            tokenVault.depositTo{value: msg.value}(_ccy, _fundingAmount, _user);
        }

        for (uint256 i; i < correctionCount; ++i) {
            Correction calldata correction = _corrections[i];
            lendingMarketController.recoverUserFunds(
                _ccy,
                correction.maturity,
                _user,
                correction.side,
                correction.amount,
                correction.unitPrice
            );
            emit CorrectionExecuted(
                _batchId,
                correction.correctionId,
                _user,
                _ccy,
                correction.maturity,
                correction.side,
                correction.amount,
                correction.unitPrice
            );
        }

        tokenVault.pause();
        _finishFunding(token, balanceBefore);

        emit CorrectionBatchExecuted(
            _batchId,
            _user,
            _ccy,
            msg.sender,
            _fundingAmount,
            correctionCount
        );
    }

    /**
     * @notice Transfers all current FV and GV positions and the remaining Deposit for one user
     * and currency.
     */
    function executeAssetTransfer(
        bytes32 _ccy,
        address _user,
        address _receiver
    ) external onlyOwner nonReentrant {
        if (_user == address(0) || _receiver == address(0) || _user == _receiver) {
            revert InvalidAddress();
        }

        bytes32 transferId = keccak256(abi.encode(_ccy, _user));
        if (executedAssetTransfers[transferId]) {
            revert RecoveryAlreadyExecuted(transferId);
        }
        if (!IPausable(address(tokenVault)).paused()) {
            revert ProtocolNotPaused(address(tokenVault));
        }

        executedAssetTransfers[transferId] = true;
        tokenVault.unpause();
        lendingMarketController.transferAssetsForRecovery(_ccy, _user, _receiver);
        tokenVault.pause();
    }

    function _prepareFunding(
        bytes32 _ccy,
        uint256 _fundingAmount
    ) private returns (address token, uint256 balanceBefore) {
        token = tokenVault.getTokenAddress(_ccy);
        if (token == nativeToken) {
            if (msg.value != _fundingAmount) {
                revert InvalidMsgValue(_fundingAmount, msg.value);
            }
            balanceBefore = address(this).balance - msg.value;
        } else {
            if (msg.value != 0) revert InvalidMsgValue(0, msg.value);
            balanceBefore = IERC20(token).balanceOf(address(this));
            if (_fundingAmount != 0) {
                TransferHelper.safeTransferFrom(token, msg.sender, address(this), _fundingAmount);
                uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
                if (received != _fundingAmount) {
                    revert UnexpectedAssetBalance(_fundingAmount, received);
                }
                TransferHelper.safeApprove(token, address(tokenVault), 0);
                TransferHelper.safeApprove(token, address(tokenVault), _fundingAmount);
            }
        }
    }

    function _finishFunding(address _token, uint256 _balanceBefore) private {
        if (_token == nativeToken) {
            uint256 balanceAfter = address(this).balance;
            if (balanceAfter != _balanceBefore) {
                revert UnexpectedAssetBalance(_balanceBefore, balanceAfter);
            }
        } else {
            TransferHelper.safeApprove(_token, address(tokenVault), 0);
            uint256 allowance = IERC20(_token).allowance(address(this), address(tokenVault));
            if (allowance != 0) revert UnexpectedAllowance(allowance);

            uint256 balanceAfter = IERC20(_token).balanceOf(address(this));
            if (balanceAfter != _balanceBefore) {
                revert UnexpectedAssetBalance(_balanceBefore, balanceAfter);
            }
        }
    }
}
