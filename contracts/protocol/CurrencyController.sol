// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// dependencies
import {AggregatorV3Interface} from "../dependencies/chainlink/AggregatorV3Interface.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ICurrencyController} from "./interfaces/ICurrencyController.sol";
// libraries
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
import {RoundingInt256} from "./libraries/math/RoundingInt256.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {CurrencyControllerStorage as Storage, PriceFeed} from "./storages/CurrencyControllerStorage.sol";

/**
 * @notice Implements managing of the supported currencies in the protocol.
 *
 * This contract links new currencies to Chainlink price feeds. To add a new currency to the protocol except for the base currency,
 * the owner needs to also add an existing price feed contract.
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
        if (!currencyExists(_ccy)) revert InvalidCurrency();
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

    /**
     * @notice Gets cached decimal of the price feed for the selected currency.
     * @param _ccy Currency name in bytes32
     */
    function getDecimals(bytes32 _ccy) external view override returns (uint8) {
        return Storage.slot().decimalsCaches[_ccy];
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
     * @notice Gets price feed for the selected currency.
     * @param _ccy Currency name in bytes32
     */
    function getPriceFeed(bytes32 _ccy) external view override returns (PriceFeed memory) {
        return Storage.slot().priceFeeds[_ccy];
    }

    /**
     * @notice Gets if the selected currency is supported.
     * @param _ccy Currency name in bytes32
     * @return The boolean if the selected currency is supported or not
     */
    function currencyExists(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().currencies.contains(_ccy);
    }

    /**
     * @notice Adds new currency into the protocol and links with existing price feed.
     * @param _ccy Currency name in bytes32k
     * @param _decimals Currency decimals
     * @param _haircut Remaining ratio after haircut
     * @param _priceFeeds Array with the contract address of price feed
     */
    function addCurrency(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _haircut,
        address[] calldata _priceFeeds,
        uint256 _heartbeat
    ) public override onlyOwner {
        Storage.slot().currencies.add(_ccy);

        _updateHaircut(_ccy, _haircut);
        _updatePriceFeed(_ccy, _decimals, _priceFeeds, _heartbeat);

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
        _updateHaircut(_ccy, _haircut);
    }

    /**
     * @notice Update the price feed contract addresses.
     * @param _ccy Currency name in bytes32
     * @param _decimals Currency decimals
     * @param _priceFeeds Array with the contract address of price feed
     */
    function updatePriceFeed(
        bytes32 _ccy,
        uint8 _decimals,
        address[] calldata _priceFeeds,
        uint256 _heartbeat
    ) public override onlyOwner onlySupportedCurrency(_ccy) {
        _updatePriceFeed(_ccy, _decimals, _priceFeeds, _heartbeat);
    }

    /**
     * @notice Removes existing Chainlink price feed.
     * @param _ccy Currency name in bytes32
     */
    function removePriceFeed(bytes32 _ccy) external override onlyOwner onlySupportedCurrency(_ccy) {
        PriceFeed memory priceFeed = Storage.slot().priceFeeds[_ccy];

        if (priceFeed.instances.length == 0) revert NoPriceFeedExists();
        delete Storage.slot().priceFeeds[_ccy];
        delete Storage.slot().decimalsCaches[_ccy];

        emit PriceFeedRemoved(_ccy);
    }

    /**
     * @notice Gets the last price for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return price The last price
     */
    function getLastPrice(bytes32 _ccy) public view override returns (int256 price) {
        price = _getLastPrice(_ccy);
    }

    /**
     * @notice Gets the converted amount of currency.
     * @param _fromCcy Currency to convert from
     * @param _toCcy Currency to convert to
     * @param _amount Amount to be converted
     * @return amount The converted amount
     */
    function convert(
        bytes32 _fromCcy,
        bytes32 _toCcy,
        uint256 _amount
    ) external view override returns (uint256 amount) {
        if (_fromCcy == _toCcy) return _amount;
        if (_amount == 0) return 0;

        int256 fromPrice = _getLastPrice(_fromCcy);
        int256 toPrice = _getLastPrice(_toCcy);

        amount = (_amount * uint256(fromPrice) * 10**Storage.slot().decimalsCaches[_toCcy]).div(
            10**Storage.slot().decimalsCaches[_fromCcy] * uint256(toPrice)
        );
    }

    /**
     * @notice Gets the converted amounts of currency.
     * @param _fromCcy Currency to convert from
     * @param _toCcy Currency to convert to
     * @param _amounts Amounts to be converted
     * @return amounts The converted amounts
     */
    function convert(
        bytes32 _fromCcy,
        bytes32 _toCcy,
        uint256[] calldata _amounts
    ) external view override returns (uint256[] memory amounts) {
        if (_fromCcy == _toCcy) return _amounts;

        int256 fromPrice = _getLastPrice(_fromCcy);
        int256 toPrice = _getLastPrice(_toCcy);
        uint256 toDecimals = Storage.slot().decimalsCaches[_toCcy];
        uint256 fromDecimals = Storage.slot().decimalsCaches[_fromCcy];
        amounts = new uint256[](_amounts.length);

        for (uint256 i; i < _amounts.length; i++) {
            if (_amounts[i] == 0) continue;

            amounts[i] = (_amounts[i] * uint256(fromPrice) * 10**toDecimals).div(
                10**fromDecimals * uint256(toPrice)
            );
        }
    }

    /**
     * @notice Gets the converted amount in the base currency.
     * @param _ccy Currency that has to be converted to the base currency
     * @param _amount Amount to be converted
     * @return amount The converted amount
     */
    function convertToBaseCurrency(bytes32 _ccy, uint256 _amount)
        public
        view
        override
        returns (uint256 amount)
    {
        if (_amount == 0) return 0;

        amount = (_amount * _getLastPrice(_ccy).toUint256()).div(
            10**Storage.slot().decimalsCaches[_ccy]
        );
    }

    /**
     * @notice Gets the converted amount in the base currency.
     * @param _ccy Currency that has to be converted to the base currency.
     * @param _amount Amount to be converted
     * @return amount The converted amount
     */
    function convertToBaseCurrency(bytes32 _ccy, int256 _amount)
        external
        view
        override
        returns (int256 amount)
    {
        if (_amount == 0) return 0;

        amount = (_amount * _getLastPrice(_ccy)).div(
            (10**Storage.slot().decimalsCaches[_ccy]).toInt256()
        );
    }

    /**
     * @notice Gets the converted amounts in the base currency.
     * @param _ccy Currency that has to be converted to the base currency.
     * @param _amounts Amounts to be converted
     * @return amounts The converted amounts
     */
    function convertToBaseCurrency(bytes32 _ccy, uint256[] calldata _amounts)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](_amounts.length);
        uint256 price = _getLastPrice(_ccy).toUint256();
        uint256 decimals = Storage.slot().decimalsCaches[_ccy];

        for (uint256 i; i < _amounts.length; i++) {
            if (_amounts[i] == 0) continue;
            amounts[i] = (_amounts[i] * price).div(10**decimals);
        }
    }

    /**
     * @notice Gets the converted amount to the selected currency from the base currency.
     * @param _ccy Currency that has to be converted from the base currency.
     * @param _amount Amount in the base currency to be converted
     * @return amount The converted amount
     */
    function convertFromBaseCurrency(bytes32 _ccy, uint256 _amount)
        public
        view
        override
        returns (uint256 amount)
    {
        amount = (_amount * 10**Storage.slot().decimalsCaches[_ccy]).div(
            _getLastPrice(_ccy).toUint256()
        );
    }

    /**
     * @notice Gets the converted amounts to the selected currency from the base currency.
     * @param _ccy Currency that has to be converted to the base currency.
     * @param _amounts Amounts in the base currency to be converted
     * @return amounts The converted amounts
     */
    function convertFromBaseCurrency(bytes32 _ccy, uint256[] calldata _amounts)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](_amounts.length);
        uint256 price = _getLastPrice(_ccy).toUint256();
        uint256 decimals = Storage.slot().decimalsCaches[_ccy];

        for (uint256 i; i < _amounts.length; i++) {
            if (_amounts[i] == 0) continue;

            amounts[i] = (_amounts[i] * 10**decimals).div(price);
        }
    }

    function _getLastPrice(bytes32 _ccy) internal view returns (int256 totalPrice) {
        PriceFeed memory priceFeeds = Storage.slot().priceFeeds[_ccy];
        totalPrice = 1;

        for (uint256 i; i < priceFeeds.instances.length; i++) {
            (, int256 price, , uint256 updatedAt, ) = priceFeeds.instances[i].latestRoundData();

            if (updatedAt < block.timestamp - priceFeeds.heartbeat + 1 hours) {
                revert StalePriceFeed(
                    address(priceFeeds.instances[i]),
                    priceFeeds.heartbeat,
                    updatedAt,
                    block.timestamp
                );
            }
            totalPrice = totalPrice * price;
        }
    }

    function _updateHaircut(bytes32 _ccy, uint256 _haircut) internal {
        if (_haircut > 10000) revert InvalidHaircut();

        Storage.slot().haircuts[_ccy] = _haircut;

        emit HaircutUpdated(_ccy, _haircut);
    }

    function _updatePriceFeed(
        bytes32 _ccy,
        uint8 _decimals,
        address[] calldata _priceFeeds,
        uint256 _heartbeat
    ) internal {
        AggregatorV3Interface[] memory priceFeeds = new AggregatorV3Interface[](_priceFeeds.length);

        if (_priceFeeds.length == 0) revert InvalidPriceFeed();

        for (uint256 i; i < _priceFeeds.length; i++) {
            priceFeeds[i] = AggregatorV3Interface(_priceFeeds[i]);
            (, int256 price, , , ) = priceFeeds[i].latestRoundData();
            if (price < 0) revert InvalidPrice();

            uint8 decimals = priceFeeds[i].decimals();
            if (decimals > 18) revert InvalidDecimals();
        }

        Storage.slot().priceFeeds[_ccy] = PriceFeed(priceFeeds, _heartbeat);
        Storage.slot().decimalsCaches[_ccy] = _decimals;

        emit PriceFeedUpdated(_ccy, _decimals, _priceFeeds);
    }
}
