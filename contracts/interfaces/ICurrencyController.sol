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
    event AddCurrency(bytes32 indexed ccy, uint256 haircut);
    event RemoveCurrency(bytes32 indexed ccy);

    event UpdateHaircut(bytes32 indexed ccy, uint256 haircut);

    event AddPriceFeed(bytes32 ccy, string secondCcy, address indexed priceFeed);
    event RemovePriceFeed(bytes32 ccy, string secondCcy, address indexed priceFeed);

    function convert(
        bytes32 _fromCcy,
        bytes32 _toCcy,
        uint256 _amount
    ) external view returns (uint256 amount);

    function convertFromETH(bytes32 _ccy, uint256 _amountETH)
        external
        view
        returns (uint256 amount);

    function convertToETH(bytes32 _ccy, uint256 _amount) external view returns (uint256 amount);

    function convertToETH(bytes32 _ccy, int256 _amount) external view returns (int256 amount);

    function convertToETH(bytes32 _ccy, uint256[] memory _amounts)
        external
        view
        returns (uint256[] memory amounts);

    function getEthDecimals(bytes32) external view returns (uint8);

    function getUsdDecimals(bytes32) external view returns (uint8);

    function getCurrencies() external view returns (bytes32[] memory);

    function getHaircut(bytes32 _ccy) external view returns (uint256);

    function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256);

    function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256);

    function getLastETHPrice(bytes32 _ccy) external view returns (int256);

    function getLastUSDPrice(bytes32 _ccy) external view returns (int256);

    function currencyExists(bytes32 _ccy) external view returns (bool);

    function linkPriceFeed(
        bytes32 _ccy,
        address _priceFeedAddr,
        bool _isEthPriceFeed
    ) external returns (bool);

    function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed) external;

    function addCurrency(
        bytes32 _ccy,
        address _ethPriceFeed,
        uint256 _haircut
    ) external;

    function updateHaircut(bytes32 _ccy, uint256 _haircut) external;

    function removeCurrency(bytes32 _ccy) external;
}
