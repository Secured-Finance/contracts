// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAddressResolver} from "./interfaces/IAddressResolver.sol";
import {IProxyController} from "./interfaces/IProxyController.sol";
import {Contracts} from "./libraries/Contracts.sol";
import {UpgradeabilityProxy} from "./utils/UpgradeabilityProxy.sol";

/**
 * @notice Implements the management of proxy contracts.
 *
 * All proxy contracts are deployed from this contract.
 * This contract is also used to update the proxy implementation.
 */

contract ProxyController is IProxyController, Ownable {
    IAddressResolver private resolver;
    bytes32 private constant ADDRESS_RESOLVER = "AddressResolver";

    /**
     * @notice Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     *
     * @dev Set a proxy contract address of AddressResolver if it already exists.
     * If not, set zero address here and call `setAddressResolverImpl` using the implementation
     * address of AddressResolver to create a proxy contract.
     */
    constructor(address _resolver) Ownable() {
        if (_resolver != address(0)) {
            UpgradeabilityProxy proxy = UpgradeabilityProxy(payable(_resolver));
            require(proxy.implementation() != address(0), "Proxy address not found");
            resolver = IAddressResolver(_resolver);
        }
    }

    /**
     * @notice Gets the proxy address of AddressResolver
     * @return The contract address of AddressResolver
     */
    function getAddressResolverAddress() public view returns (address) {
        return (address(resolver));
    }

    /**
     * @notice Gets the proxy address fro selected name
     * @param name The cache name of the contract
     * @return proxyAddress The proxy address for selected name
     */
    function getAddress(bytes32 name) public view returns (address proxyAddress) {
        proxyAddress = resolver.getAddress(name, "Address not found");
        UpgradeabilityProxy proxy = UpgradeabilityProxy(payable(proxyAddress));

        require(proxy.implementation() != address(0), "Proxy address not found");
    }

    /**
     * @notice Sets the implementation contract of AddressResolver
     * @param newImpl The address of implementation contract
     */
    function setAddressResolverImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        address proxyAddress = _updateImpl(ADDRESS_RESOLVER, newImpl, data);
        resolver = IAddressResolver(proxyAddress);
    }

    /**
     * @notice Sets the implementation contract of CurrencyController
     * @param newImpl The address of implementation contract
     */
    function setBeaconProxyControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(Contracts.BEACON_PROXY_CONTROLLER, newImpl, data);
    }

    /**
     * @notice  Sets the implementation contract of TokenVault
     * @param newImpl The address of implementation contract
     * @param liquidationThresholdRate  The rate used as the auto liquidation threshold
     * @param liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param liquidatorFeeRate The liquidation fee rate received by liquidators
     * @param uniswapRouter Uniswap router contract address
     * @param uniswapQuoter Uniswap quoter contract address
     * @param WETH9 The address of WETH
     */
    function setTokenVaultImpl(
        address newImpl,
        uint256 liquidationThresholdRate,
        uint256 liquidationProtocolFeeRate,
        uint256 liquidatorFeeRate,
        address uniswapRouter,
        address uniswapQuoter,
        address WETH9
    ) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256,uint256,uint256,address,address,address)",
            msg.sender,
            resolver,
            liquidationThresholdRate,
            liquidationProtocolFeeRate,
            liquidatorFeeRate,
            uniswapRouter,
            uniswapQuoter,
            WETH9
        );
        _updateImpl(Contracts.TOKEN_VAULT, newImpl, data);
    }

    /**
     * @notice Sets the implementation contract of CurrencyController
     * @param newImpl The address of implementation contract
     */
    function setCurrencyControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.CURRENCY_CONTROLLER, newImpl, data);
    }

    /**
     * @notice Sets the implementation contract of GenesisValueVault
     * @param newImpl The address of implementation contract
     */
    function setGenesisValueVaultImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.GENESIS_VALUE_VAULT, newImpl, data);
    }

    /**
     * @notice Sets the implementation contract of LendingMarketController
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketControllerImpl(address newImpl, uint256 orderFeeRate)
        external
        onlyOwner
    {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256)",
            msg.sender,
            resolver,
            orderFeeRate
        );
        _updateImpl(Contracts.LENDING_MARKET_CONTROLLER, newImpl, data);
    }

    /**
     * @notice Sets the implementation contract of ReserveFund
     * @param newImpl The address of implementation contract
     * @param WETH9 The address of WETH
     */
    function setReserveFundImpl(address newImpl, address WETH9) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,address)",
            msg.sender,
            resolver,
            WETH9
        );
        _updateImpl(Contracts.RESERVE_FUND, newImpl, data);
    }

    /**
     * @notice Updates admin addresses of proxy contract
     * @param newAdmin The address of new admin
     * @param destinations The destination contract addresses
     */
    function changeProxyAdmins(address newAdmin, address[] calldata destinations)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < destinations.length; i++) {
            UpgradeabilityProxy proxy = UpgradeabilityProxy(payable(destinations[i]));
            proxy.changeAdmin(newAdmin);
        }
    }

    /**
     * @notice Updates the implementation contract of specified contract
     * The first time the contract address is set, `UpgradeabilityProxy` is created.
     * From the second time, the contract address set in the created `UpgradeabilityProxy`
     * will be updated.
     *
     * @param name The cache name of the contract
     * @param newAddress The address of implementation contract
     * @param data the data in a delegate call to a specified function
     */
    function _updateImpl(
        bytes32 name,
        address newAddress,
        bytes memory data
    ) internal returns (address proxyAddress) {
        proxyAddress = _getAddress(name);
        UpgradeabilityProxy proxy;

        if (proxyAddress == address(0)) {
            proxy = new UpgradeabilityProxy(payable(newAddress), data);
            proxyAddress = address(proxy);

            emit ProxyCreated(name, proxyAddress, newAddress);
        } else {
            proxy = UpgradeabilityProxy(payable(proxyAddress));
            address oldAddress = proxy.implementation();
            proxy.upgradeTo(newAddress);
            emit ProxyUpdated(name, proxyAddress, newAddress, oldAddress);
        }
    }

    function _getAddress(bytes32 name) internal view returns (address) {
        if (name == ADDRESS_RESOLVER) {
            return address(resolver);
        } else {
            return resolver.getAddress(name);
        }
    }
}
