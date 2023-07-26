// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {IReserveFund} from "./interfaces/IReserveFund.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {ERC20Handler} from "./libraries/ERC20Handler.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
import {Wallet} from "./utils/Wallet.sol";
// storages
import {ReserveFundStorage as Storage} from "./storages/ReserveFundStorage.sol";

/**
 * @notice Implements managing of the reserve fund.
 */
contract ReserveFund is IReserveFund, MixinAddressResolver, Ownable, Proxyable, Wallet {
    receive() external payable {}

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _WETH9 The address of WETH
     */
    function initialize(
        address _owner,
        address _resolver,
        address _WETH9
    ) public initializer onlyProxy {
        Storage.slot().paused = false;

        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
        ERC20Handler.initialize(_WETH9);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[1] = Contracts.TOKEN_VAULT;
    }

    /**
     * @notice Gets if the reserve fund is paused.
     * @return The boolean if the reserve fund is paused
     */
    function isPaused() public view override returns (bool) {
        return Storage.slot().paused;
    }

    /**
     * @notice Pauses the reserve fund.
     */
    function pause() public override {
        Storage.slot().paused = true;
        emit Pause(msg.sender);
    }

    /**
     * @notice Unpauses the reserve fund.
     */
    function unpause() public override {
        Storage.slot().paused = false;
        emit Unpause(msg.sender);
    }

    /**
     * @dev Deposits funds by the caller into the token vault as reserve fund.
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function deposit(bytes32 _ccy, uint256 _amount) external payable override onlyOwner {
        _deposit(address(tokenVault()), _ccy, _amount);
    }

    /**
     * @dev Withdraw funds by the caller from the token vault.
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function withdraw(bytes32 _ccy, uint256 _amount) external override onlyOwner {
        _withdraw(address(tokenVault()), _ccy, _amount);
    }

    /**
     * @notice Force settlement of all lending and borrowing positions.
     */
    function executeEmergencySettlement() external override onlyOwner {
        _executeEmergencySettlement(address(lendingMarketController()));
    }

    /**
     * @dev Execute an arbitrary transaction by Secured Finance team.
     * @param _to Address to be called
     * @param _data Encoded function to be called
     */
    function executeTransaction(address payable _to, bytes memory _data)
        external
        payable
        override
        onlyOwner
    {
        _executeTransaction(_to, _data);
    }
}
