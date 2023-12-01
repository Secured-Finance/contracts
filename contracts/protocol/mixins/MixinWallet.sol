// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
// libraries
import {TransferHelper} from "../libraries/TransferHelper.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";

/**
 * @notice Implements functions to make a contract a wallet, i.e. withdraw and deposit funds.
 *
 * The _initialize function of this contract is expected to be called in an inheriting contract's intializer or constructor.
 *
 */
abstract contract MixinWallet is Ownable {
    error TransactionFailed(uint256 index);
    error WrongArrayLengths();

    event TransactionExecuted(address from, address target, uint256 value, bytes data);
    event TransactionsExecuted(address from, address[] targets, uint256[] values, bytes[] data);

    function _initialize(address _owner, address _nativeToken) internal {
        _transferOwnership(_owner);
        TransferHelper.initialize(_nativeToken);
    }

    /**
     * @dev Executes an arbitrary transaction by Secured Finance admin.
     * @param _target Address to be called
     * @param _data Encoded function data to be executed
     */
    function executeTransaction(address _target, bytes calldata _data) external payable onlyOwner {
        (bool success, ) = _target.call{value: msg.value}(_data);
        if (!success) revert TransactionFailed(0);

        emit TransactionExecuted(msg.sender, _target, msg.value, _data);
    }

    /**
     * @dev Executes arbitrary transactions by Secured Finance admin.
     * @param _targets Array of Addresses to be called
     * @param _values Array of values to be sent to _targets addresses
     * @param _data Encoded function data to be executed
     */
    function executeTransactions(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _data
    ) external onlyOwner {
        if (_targets.length != _data.length || _targets.length != _values.length) {
            revert WrongArrayLengths();
        }

        for (uint256 i; i < _targets.length; i++) {
            (bool success, ) = _targets[i].call{value: _values[i]}(_data[i]);
            if (!success) revert TransactionFailed(i);
        }

        emit TransactionsExecuted(msg.sender, _targets, _values, _data);
    }

    /**
     * @dev Deposits funds by the caller into the token vault.
     * @param _tokenVault TokenVault contract instance
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function _deposit(ITokenVault _tokenVault, bytes32 _ccy, uint256 _amount) internal {
        address tokenAddress = _tokenVault.getTokenAddress(_ccy);
        if (!TransferHelper.isNative(tokenAddress)) {
            TransferHelper.safeTransferFrom(tokenAddress, msg.sender, address(this), _amount);
            TransferHelper.safeApprove(tokenAddress, address(_tokenVault), _amount);
        }
        _tokenVault.deposit{value: msg.value}(_ccy, _amount);
    }

    /**
     * @dev Withdraws funds by the caller from the token vault.
     * @param _tokenVault TokenVault contract instance
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function _withdraw(ITokenVault _tokenVault, bytes32 _ccy, uint256 _amount) internal {
        _tokenVault.withdraw(_ccy, _amount);

        address tokenAddress = _tokenVault.getTokenAddress(_ccy);
        if (TransferHelper.isNative(tokenAddress)) {
            TransferHelper.safeTransferETH(msg.sender, _amount);
        } else {
            TransferHelper.safeTransfer(tokenAddress, msg.sender, _amount);
        }
    }
}
