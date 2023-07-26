// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
// libraries
import {ERC20Handler} from "../libraries/ERC20Handler.sol";

abstract contract Wallet {
    event ExecuteTransaction(address from, address to, uint256 value, bytes data);

    /**
     * @dev Deposits funds by the caller into the token vault as reserve fund.
     * @param _tokenvault TokenVault address
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function _deposit(
        address _tokenvault,
        bytes32 _ccy,
        uint256 _amount
    ) internal virtual {
        address tokenAddress = ITokenVault(_tokenvault).getTokenAddress(_ccy);
        if (ERC20Handler.baseCurrency() != tokenAddress) {
            ERC20Handler.safeTransferFrom(tokenAddress, msg.sender, address(this), _amount);
            ERC20Handler.safeApprove(tokenAddress, _tokenvault, _amount);
        }
        ITokenVault(_tokenvault).deposit{value: msg.value}(_ccy, _amount);
    }

    /**
     * @dev Withdraw funds by the caller from the token vault.
     * @param _tokenvault TokenVault address
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function _withdraw(
        address _tokenvault,
        bytes32 _ccy,
        uint256 _amount
    ) internal virtual {
        ITokenVault(_tokenvault).withdraw(_ccy, _amount);

        address tokenAddress = ITokenVault(_tokenvault).getTokenAddress(_ccy);
        if (ERC20Handler.baseCurrency() == tokenAddress) {
            ERC20Handler.safeTransferETH(msg.sender, _amount);
        } else {
            ERC20Handler.safeTransfer(tokenAddress, msg.sender, _amount);
        }
    }

    /**
     * @notice Force settlement of all lending and borrowing positions.
     * @param _tokenvault TokenVault address
     */
    function _executeEmergencySettlement(address _tokenvault) internal virtual {
        ILendingMarketController(_tokenvault).executeEmergencySettlement();
    }

    /**
     * @dev Execute an arbitrary transaction by Secured Finance admin.
     * @param _to Address to be called
     * @param _data Encoded function data to be executed
     */
    function _executeTransaction(address payable _to, bytes memory _data) internal virtual {
        (bool success, ) = _to.call{value: msg.value}(_data);
        require(success, "Transaction failed");

        emit ExecuteTransaction(msg.sender, _to, msg.value, _data);
    }
}
