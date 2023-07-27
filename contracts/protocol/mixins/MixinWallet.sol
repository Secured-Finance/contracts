// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
// libraries
import {ERC20Handler} from "../libraries/ERC20Handler.sol";

abstract contract MixinWallet {
    event ExecuteTransaction(address from, address target, uint256 value, bytes data);
    event ExecuteTransactions(address from, address[] targets, uint256[] values, bytes[] data);

    /**
     * @dev Deposits funds by the caller into the token vault.
     * @param _tokenvault TokenVault interface
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
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
     * @param _tokenvault TokenVault interface
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
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

    /**
     * @dev Executes an arbitrary transaction by Secured Finance admin.
     * @param _target Address to be called
     * @param _data Encoded function data to be executed
     */
    function _executeTransaction(address _target, bytes calldata _data) internal {
        (bool success, ) = _target.call{value: msg.value}(_data);
        require(success, "Transaction failed");

        emit ExecuteTransaction(msg.sender, _target, msg.value, _data);
    }

    /**
     * @dev Executes arbitrary transactions by Secured Finance admin.
     * @param _targets Array of Addresses to be called
     * @param _values Array of values to be sent to _targets addresses
     * @param _data Encoded function data to be executed
     */
    function _executeTransactions(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _data
    ) internal {
        require(
            _targets.length == _data.length && _targets.length == _values.length,
            "Wrong array lengths"
        );
        for (uint256 i = 0; i < _targets.length; i++) {
            (bool success, ) = _targets[i].call{value: _values[i]}(_data[i]);
            require(success, "Transaction failed");
        }

        emit ExecuteTransactions(msg.sender, _targets, _values, _data);
    }
}
