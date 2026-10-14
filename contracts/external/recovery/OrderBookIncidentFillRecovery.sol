// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ReentrancyGuard} from "../../dependencies/openzeppelin/security/ReentrancyGuard.sol";
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../../protocol/interfaces/ITokenVault.sol";
import {Ownable} from "../../protocol/utils/Ownable.sol";

interface IPausable {
    function paused() external view returns (bool);
}

/**
 * @notice Executes the one-time reversal of the Filecoin USDFC fill caused by the incident.
 * @dev This contract must receive OPERATOR_ROLE on LendingMarketController and TokenVault.
 * It does not recover residual order-book trees or hold protocol assets. Revoke both roles
 * after the reversal has been completed.
 */
contract OrderBookIncidentFillRecovery is Ownable, ReentrancyGuard {
    ILendingMarketController public immutable lendingMarketController;
    ITokenVault public immutable tokenVault;

    mapping(bytes32 recoveryId => bool executed) public executedRecoveries;

    error InvalidAddress();
    error InvalidRecoveryId();
    error RecoveryAlreadyExecuted(bytes32 recoveryId);
    error ProtocolNotPaused(address target);
    error UnexpectedDeposit(address user, uint256 expected, uint256 actual);
    error UnexpectedFutureValue(address user, int256 expected, int256 actual);

    event IncidentOrderFillRecoveryExecuted(
        bytes32 indexed recoveryId,
        uint48 indexed orderId,
        bytes32 indexed ccy
    );

    constructor(address _lendingMarketController, address _tokenVault, address _owner) {
        if (
            _lendingMarketController == address(0) ||
            _tokenVault == address(0) ||
            _owner == address(0)
        ) revert InvalidAddress();

        lendingMarketController = ILendingMarketController(_lendingMarketController);
        tokenVault = ITokenVault(_tokenVault);
        _transferOwnership(_owner);
    }

    /**
     * @notice Reverses one incident fill while preserving the TokenVault pause state.
     * @param _recoveryId Unique identifier used only for execution management.
     * @param _fill Fill data passed to LendingMarketController.
     * @param _expectedTakerDeposit Approved taker Deposit immediately before the reversal.
     * @param _expectedTakerFutureValue Approved taker FV immediately before the reversal.
     * @param _expectedMakerDeposit Approved maker Deposit immediately before the reversal.
     * @param _expectedMakerFutureValue Approved maker FV immediately before the reversal.
     */
    function executeIncidentOrderFillReversal(
        bytes32 _recoveryId,
        ILendingMarketController.IncidentOrderFill calldata _fill,
        uint256 _expectedTakerDeposit,
        int256 _expectedTakerFutureValue,
        uint256 _expectedMakerDeposit,
        int256 _expectedMakerFutureValue
    ) external onlyOwner nonReentrant {
        if (_recoveryId == bytes32(0)) revert InvalidRecoveryId();
        if (executedRecoveries[_recoveryId]) revert RecoveryAlreadyExecuted(_recoveryId);
        if (!IPausable(address(tokenVault)).paused()) {
            revert ProtocolNotPaused(address(tokenVault));
        }

        _validatePosition(
            _fill.ccy,
            _fill.maturity,
            _fill.taker,
            _expectedTakerDeposit,
            _expectedTakerFutureValue
        );
        _validatePosition(
            _fill.ccy,
            _fill.maturity,
            _fill.maker,
            _expectedMakerDeposit,
            _expectedMakerFutureValue
        );

        executedRecoveries[_recoveryId] = true;

        tokenVault.unpause();
        lendingMarketController.reverseIncidentOrderFill(_fill);
        tokenVault.pause();

        emit IncidentOrderFillRecoveryExecuted(_recoveryId, _fill.orderId, _fill.ccy);
    }

    function _validatePosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _expectedDeposit,
        int256 _expectedFutureValue
    ) private view {
        uint256 actualDeposit = tokenVault.getDepositAmount(_user, _ccy);
        if (actualDeposit != _expectedDeposit) {
            revert UnexpectedDeposit(_user, _expectedDeposit, actualDeposit);
        }

        (, int256 actualFutureValue) = lendingMarketController.getPosition(_ccy, _maturity, _user);
        if (actualFutureValue != _expectedFutureValue) {
            revert UnexpectedFutureValue(_user, _expectedFutureValue, actualFutureValue);
        }
    }
}
