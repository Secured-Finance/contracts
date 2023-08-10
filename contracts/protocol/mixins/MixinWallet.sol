// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
// libraries
import {ERC20Handler} from "../libraries/ERC20Handler.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";

/**
 * @notice Implements functions to make a contract a wallet, i.e. withdraw and deposit funds.
 *
 * The _initialize function of this contract is expected to be called in an inheriting contract's intializer or constructor.
 *
 */
abstract contract MixinWallet is Ownable {
    event TransactionExecuted(address from, address target, uint256 value, bytes data);
    event TransactionsExecuted(address from, address[] targets, uint256[] values, bytes[] data);

    function _initialize(address _owner, address _baseCurrencyAddr) internal {
        _transferOwnership(_owner);
        ERC20Handler.initialize(_baseCurrencyAddr);
    }

    /**
     * @dev Executes an arbitrary transaction by Secured Finance admin.
     * @param _target Address to be called
     * @param _data Encoded function data to be executed
     */
    function executeTransaction(address _target, bytes calldata _data) external payable onlyOwner {
        (bool success, ) = _target.call{value: msg.value}(_data);
        require(success, "Transaction failed");

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
        require(
            _targets.length == _data.length && _targets.length == _values.length,
            "Wrong array lengths"
        );
        for (uint256 i = 0; i < _targets.length; i++) {
            (bool success, ) = _targets[i].call{value: _values[i]}(_data[i]);
            require(success, "Transaction failed");
        }

        emit TransactionsExecuted(msg.sender, _targets, _values, _data);
    }

    /**
     * @dev Deposits funds by the caller into the token vault.
     * @param _tokenvault TokenVault contract instance
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function _deposit(
        ITokenVault _tokenvault,
        bytes32 _ccy,
        uint256 _amount
    ) internal {
        address tokenAddress = _tokenvault.getTokenAddress(_ccy);
        if (ERC20Handler.baseCurrency() != tokenAddress) {
            ERC20Handler.safeTransferFrom(tokenAddress, msg.sender, address(this), _amount);
            ERC20Handler.safeApprove(tokenAddress, address(_tokenvault), _amount);
        }
        _tokenvault.deposit{value: msg.value}(_ccy, _amount);
    }

    /**
     * @dev Withdraws funds by the caller from the token vault.
     * @param _tokenvault TokenVault contract instance
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function _withdraw(
        ITokenVault _tokenvault,
        bytes32 _ccy,
        uint256 _amount
    ) internal {
        _tokenvault.withdraw(_ccy, _amount);

        address tokenAddress = _tokenvault.getTokenAddress(_ccy);
        if (ERC20Handler.baseCurrency() == tokenAddress) {
            ERC20Handler.safeTransferETH(msg.sender, _amount);
        } else {
            ERC20Handler.safeTransfer(tokenAddress, msg.sender, _amount);
        }
    }
}
