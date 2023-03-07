// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {ICurrencyController} from "./interfaces/ICurrencyController.sol";
// libraries
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
import {RoundingInt256} from "./libraries/math/RoundingInt256.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {CurrencyControllerStorage as Storage, Currency} from "./storages/CurrencyControllerStorage.sol";

/**
 * @notice Implements managing of the supported currencies in the protocol.
 *
 * This contract links new currencies to ETH Chainlink price feeds, without an existing price feed
 * contract owner is not able to add a new currency into the protocol
 */
contract CurrencyController is ICurrencyController, Ownable, Proxyable {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using SafeCast for uint256;
    using SafeCast for int256;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    /**
     * @notice Modifier to check if the currency is supported.
     * @param _ccy Currency name in bytes32
     */
    modifier onlySupportedCurrency(bytes32 _ccy) {
        require(currencyExists(_ccy), "Unsupported asset");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     */
    function initialize(address _owner) public initializer onlyProxy {
        _transferOwnership(_owner);
    }

    // =========== CURRENCY CONTROL SECTION ===========

    /**
     * @notice Adds new currency into the protocol and links with existing ETH price feed of Chainlink.
     * @param _ccy Currency name in bytes32
     * @param _ethPriceFeed Address for ETH price feed
     * @param _haircut Remaining ratio after haircut
     */
    function addCurrency(
        bytes32 _ccy,
        address _ethPriceFeed,
        uint256 _haircut
    ) public override onlyOwner {
        Storage.slot().currencies.add(_ccy);
        Storage.slot().haircuts[_ccy] = _haircut;

        if (_ccy != "ETH") {
            require(linkPriceFeed(_ccy, _ethPriceFeed, true), "Invalid PriceFeed");
        } else {
            require(linkPriceFeed(_ccy, _ethPriceFeed, false), "Invalid PriceFeed");
        }
        emit CurrencyAdded(_ccy, _haircut);
    }

    /**
     * @notice Updates the flag indicating if the currency is supported in the protocol.
     * @param _ccy Currency name in bytes32
     */
    function removeCurrency(bytes32 _ccy) public override onlyOwner {
        Storage.slot().currencies.remove(_ccy);
        emit CurrencyRemoved(_ccy);
    }

    /**
     * @notice Updates the haircut ratio for supported currency
     * @param _ccy Currency name in bytes32
     * @param _haircut Remaining ratio after haircut
     */
    function updateHaircut(bytes32 _ccy, uint256 _haircut)
        public
        override
        onlyOwner
        onlySupportedCurrency(_ccy)
    {
        require(_haircut > 0, "Incorrect haircut ratio");
        require(_haircut <= 10000, "Haircut ratio overflow");

        Storage.slot().haircuts[_ccy] = _haircut;

        emit HaircutUpdated(_ccy, _haircut);
    }

    /**
     * @notice Get ETH decimal for the selected currency.
     * @param _ccy Currency name in bytes32
     */
    function getEthDecimals(bytes32 _ccy) external view returns (uint8) {
        return Storage.slot().ethDecimals[_ccy];
    }

    /**
     * @notice Gets USD decimal for the selected currency.
     * @param _ccy Currency name in bytes32
     */
    function getUsdDecimals(bytes32 _ccy) external view returns (uint8) {
        return Storage.slot().usdDecimals[_ccy];
    }

    /**
     * @notice Gets all currencies.
     * @return The array of the currency
     */
    function getCurrencies() external view override returns (bytes32[] memory) {
        return Storage.slot().currencies.values();
    }

    /**
     * @notice Gets haircut ratio for the selected currency.
     * Haircut is used in bilateral netting cross-calculation.
     * @param _ccy Currency name in bytes32
     */
    function getHaircut(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().haircuts[_ccy];
    }

    /**
     * @notice Gets if the selected currency is supported.
     * @param _ccy Currency name in bytes32
     * @return The boolean if the selected currency is supported or not
     */
    function currencyExists(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().currencies.contains(_ccy);
    }

    // =========== CHAINLINK PRICE FEED FUNCTIONS ===========
    // TODO: Add additional price feeds in case if Chainlink is not reliable

    /**
     * @notice Links the contract to existing Chainlink price feed.
     * @dev This method can use only Chainlink.
     * @param _ccy Currency name in bytes32
     * @param _priceFeedAddr The contract address of Chainlink price feed
     * @param _isEthPriceFeed Boolean if the price feed is in ETH or not
     * @return True if the execution of the operation succeeds
     */
    function linkPriceFeed(
        bytes32 _ccy,
        address _priceFeedAddr,
        bool _isEthPriceFeed
    ) public override onlyOwner returns (bool) {
        require(_priceFeedAddr != address(0), "Couldn't link 0x0 address");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_priceFeedAddr);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price >= 0, "Invalid PriceFeed");

        uint8 decimals = priceFeed.decimals();
        require(decimals <= 18, "Invalid decimals");

        if (_isEthPriceFeed) {
            require(!_isETH(_ccy), "Can't link to ETH");
            Storage.slot().ethPriceFeeds[_ccy] = priceFeed;
            Storage.slot().ethDecimals[_ccy] = decimals;
            emit PriceFeedAdded(_ccy, "ETH", _priceFeedAddr);
        } else {
            Storage.slot().usdPriceFeeds[_ccy] = priceFeed;
            Storage.slot().usdDecimals[_ccy] = decimals;
            emit PriceFeedAdded(_ccy, "USD", _priceFeedAddr);
        }

        return true;
    }

    /**
     * @notice Removes existing Chainlink price feed.
     * @param _ccy Currency name in bytes32
     * @param _isEthPriceFeed Boolean if the price feed is in ETH or not
     */
    function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed)
        external
        override
        onlyOwner
        onlySupportedCurrency(_ccy)
    {
        if (_isEthPriceFeed == true) {
            address priceFeed = address(Storage.slot().ethPriceFeeds[_ccy]);

            require(priceFeed != address(0), "Invalid PriceFeed");
            delete Storage.slot().ethPriceFeeds[_ccy];
            delete Storage.slot().ethDecimals[_ccy];

            emit PriceFeedRemoved(_ccy, "ETH", priceFeed);
        } else {
            address priceFeed = address(Storage.slot().usdPriceFeeds[_ccy]);

            require(priceFeed != address(0), "Invalid PriceFeed");
            delete Storage.slot().usdPriceFeeds[_ccy];
            delete Storage.slot().usdDecimals[_ccy];

            emit PriceFeedRemoved(_ccy, "USD", priceFeed);
        }
    }

    /**
     * @notice Gets the last price in USD for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return price The last price in USD
     */
    function getLastUSDPrice(bytes32 _ccy) public view override returns (int256 price) {
        AggregatorV3Interface priceFeed = Storage.slot().usdPriceFeeds[_ccy];
        (, price, , , ) = priceFeed.latestRoundData();
    }

    /**
     * @notice Gets the historical price in USD for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _roundId RoundId
     * @return The historical price in USD
     */
    function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId)
        public
        view
        override
        returns (int256)
    {
        AggregatorV3Interface priceFeed = Storage.slot().usdPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) = priceFeed.getRoundData(_roundId);

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
     * @notice Gets the last price in ETH for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return price The last price in ETH
     */
    function getLastETHPrice(bytes32 _ccy) public view override returns (int256 price) {
        if (_isETH(_ccy)) return 1e18;
        price = _getLastETHPrice(_ccy);
    }

    /**
     * @notice Gets the historical price in ETH for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _roundId RoundId
     * @return The historical price in ETH
     */
    function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId)
        public
        view
        override
        returns (int256)
    {
        if (_isETH(_ccy)) return 1e18;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) = priceFeed.getRoundData(_roundId);

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
     * @notice Gets the converted amount of currency in ETH.
     * @param _ccy Currency that has to be converted to ETH
     * @param _amount Amount to be converted
     * @return amount The converted amount
     */
    function convertToETH(bytes32 _ccy, uint256 _amount)
        external
        view
        override
        returns (uint256 amount)
    {
        if (_isETH(_ccy)) return _amount;
        if (_amount == 0) return 0;

        amount = (_amount * _getLastETHPrice(_ccy).toUint256()).div(
            10**Storage.slot().ethDecimals[_ccy]
        );
    }

    /**
     * @notice Gets the converted amount of currency in ETH.
     * @param _ccy Currency that has to be converted to ETH
     * @param _amount Amount to be converted
     * @return amount The converted amount
     */
    function convertToETH(bytes32 _ccy, int256 _amount)
        external
        view
        override
        returns (int256 amount)
    {
        if (_isETH(_ccy)) return _amount;
        if (_amount == 0) return 0;

        amount = (_amount * _getLastETHPrice(_ccy)).div(
            (10**Storage.slot().ethDecimals[_ccy]).toInt256()
        );
    }

    /**
     * @notice Gets the converted amount of currency in ETH.
     * @param _ccy Currency that has to be converted to ETH
     * @param _amounts Amounts to be converted
     * @return amounts The converted amounts
     */
    function convertToETH(bytes32 _ccy, uint256[] memory _amounts)
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        if (_isETH(_ccy)) return _amounts;

        amounts = new uint256[](_amounts.length);
        for (uint256 i = 0; i < _amounts.length; i++) {
            if (_amounts[i] == 0) continue;

            amounts[i] =
                (_amounts[i] * _getLastETHPrice(_ccy).toUint256()) /
                10**Storage.slot().ethDecimals[_ccy];
        }
    }

    /**
     * @notice Gets the converted amount to the selected currency from ETH.
     * @param _ccy Currency that has to be converted from ETH
     * @param _amountETH Amount in ETH to be converted
     * @return amount The converted amount
     */
    function convertFromETH(bytes32 _ccy, uint256 _amountETH)
        public
        view
        override
        returns (uint256 amount)
    {
        if (_isETH(_ccy)) return _amountETH;

        amount =
            (_amountETH * 10**Storage.slot().ethDecimals[_ccy]) /
            _getLastETHPrice(_ccy).toUint256();
        require(amount != 0, "Too small amount");
    }

    function _isETH(bytes32 _ccy) internal pure returns (bool) {
        return _ccy == "ETH";
    }

    function _getLastETHPrice(bytes32 _ccy) internal view returns (int256 price) {
        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, price, , , ) = priceFeed.latestRoundData();
    }
}
