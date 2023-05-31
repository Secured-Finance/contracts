// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Currency} from "../storages/CurrencyControllerStorage.sol";

/**
 * @dev Currency Controller contract is responsible for managing supported
 * currencies in Secured Finance Protocol
 *
 * Contract links new currencies to ETH Chainlink price feeds, without existing price feed
 * contract owner is not able to add a new currency into the protocol
 */
interface ICurrencyController {
    event CurrencyAdded(bytes32 indexed ccy, uint256 haircut);
    event CurrencyRemoved(bytes32 indexed ccy);

    event HaircutUpdated(bytes32 indexed ccy, uint256 haircut);

    event PriceFeedUpdated(bytes32 ccy, uint256 decimals, address[] indexed priceFeeds);
    event PriceFeedRemoved(bytes32 ccy);

    function convert(
        bytes32 _fromCcy,
        bytes32 _toCcy,
        uint256 _amount
    ) external view returns (uint256 amount);

    function convertFromBaseCurrency(bytes32 _ccy, uint256 _amountETH)
        external
        view
        returns (uint256 amount);

    function convertToBaseCurrency(bytes32 _ccy, uint256 _amount)
        external
        view
        returns (uint256 amount);

    function convertToBaseCurrency(bytes32 _ccy, int256 _amount)
        external
        view
        returns (int256 amount);

    function convertToBaseCurrency(bytes32 _ccy, uint256[] memory _amounts)
        external
        view
        returns (uint256[] memory amounts);

    function getBaseCurrency() external view returns (bytes32);

    function getDecimals(bytes32) external view returns (uint8);

    function getCurrencies() external view returns (bytes32[] memory);

    function getHaircut(bytes32 _ccy) external view returns (uint256);

    function getLastPrice(bytes32 _ccy) external view returns (int256);

    function currencyExists(bytes32 _ccy) external view returns (bool);

    function updatePriceFeed(
        bytes32 _ccy,
        uint8 _decimals,
        address[] calldata _priceFeeds
    ) external;

    function removePriceFeed(bytes32 _ccy) external;

    function addCurrency(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _haircut,
        address[] calldata _priceFeeds
    ) external;

    function updateHaircut(bytes32 _ccy, uint256 _haircut) external;

    function removeCurrency(bytes32 _ccy) external;
}
