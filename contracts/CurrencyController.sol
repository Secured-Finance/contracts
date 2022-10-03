// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {ICurrencyController} from "./interfaces/ICurrencyController.sol";
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
import {CurrencyControllerStorage as Storage, Currency} from "./storages/CurrencyControllerStorage.sol";

/**
 * @notice Implements managing of the supported currencies in the protocol.
 *
 * This contract links new currencies to ETH Chainlink price feeds, without an existing price feed
 * contract owner is not able to add a new currency into the protocol
 */
contract CurrencyController is ICurrencyController, Ownable, Proxyable {
    /**
     * @notice Modifier to check if the currency is supported.
     * @param _ccy Currency name in bytes32
     */
    modifier supportedCcyOnly(bytes32 _ccy) {
        require(isSupportedCcy(_ccy), "Unsupported asset");
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
     * @param _name Currency full name
     * @param _ethPriceFeed Address for ETH price feed
     * @param _haircut Haircut ratio used to calculate in collateral calculations
     */
    function supportCurrency(
        bytes32 _ccy,
        string memory _name,
        address _ethPriceFeed,
        uint256 _haircut
    ) public override onlyOwner {
        Currency memory currency;
        currency.name = _name;
        currency.isSupported = true;

        Storage.slot().currencies[_ccy] = currency;
        Storage.slot().haircuts[_ccy] = _haircut;

        if (_ccy != "ETH") {
            require(linkPriceFeed(_ccy, _ethPriceFeed, true), "Invalid PriceFeed");
        } else {
            require(linkPriceFeed(_ccy, _ethPriceFeed, false), "Invalid PriceFeed");
        }
        emit CcyAdded(_ccy, _name, _haircut);
    }

    /**
     * @notice Updates the flag indicating if the currency is supported in the protocol.
     * @param _ccy Currency name in bytes32
     * @param _isSupported Boolean if currency is supported
     */
    function updateCurrencySupport(bytes32 _ccy, bool _isSupported) public override onlyOwner {
        Currency storage currency = Storage.slot().currencies[_ccy];
        currency.isSupported = _isSupported;

        emit CcySupportUpdate(_ccy, _isSupported);
    }

    /**
     * @notice Updates the haircut ratio for supported currency
     * @param _ccy Currency name in bytes32
     * @param _haircut Haircut ratio used to calculate in collateral calculations
     */
    function updateCcyHaircut(bytes32 _ccy, uint256 _haircut)
        public
        override
        onlyOwner
        supportedCcyOnly(_ccy)
    {
        require(_haircut > 0, "Incorrect haircut ratio");
        require(_haircut <= 10000, "Haircut ratio overflow");

        Storage.slot().haircuts[_ccy] = _haircut;

        emit HaircutUpdated(_ccy, _haircut);
    }

    /**
     * @notice Gets the currency data.
     * @param _ccy Currency name in bytes32
     * @return The currency data
     */
    function getCurrencies(bytes32 _ccy) external view returns (Currency memory) {
        return Storage.slot().currencies[_ccy];
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
    function isSupportedCcy(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().currencies[_ccy].isSupported;
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
        supportedCcyOnly(_ccy)
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
     * @return The last price in USD
     */
    function getLastUSDPrice(bytes32 _ccy) public view override returns (int256) {
        AggregatorV3Interface priceFeed = Storage.slot().usdPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
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
     * @return The last price in ETH
     */
    function getLastETHPrice(bytes32 _ccy) public view override returns (int256) {
        if (_isETH(_ccy)) return 1e18;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
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
     * @return The converted amount
     */
    function convertToETH(bytes32 _ccy, uint256 _amount) external view override returns (uint256) {
        if (_isETH(_ccy)) return _amount;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return (_amount * uint256(price)) / 1e18;
    }

    /**
     * @notice Gets the converted amount of currency in ETH.
     * @param _ccy Currency that has to be converted to ETH
     * @param _amount Amount to be converted
     * @return The converted amount
     */
    function convertToETH(bytes32 _ccy, int256 _amount) external view override returns (int256) {
        if (_isETH(_ccy)) return _amount;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return (_amount * price) / 1e18;
    }

    /**
     * @notice Gets the converted amount to the selected currency from ETH.
     * @param _ccy Currency that has to be converted from ETH
     * @param _amountETH Amount in ETH to be converted
     * @return The converted amount
     */
    function convertFromETH(bytes32 _ccy, uint256 _amountETH)
        public
        view
        override
        returns (uint256)
    {
        if (_isETH(_ccy)) return _amountETH;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return (_amountETH * 1e18) / uint256(price); // add decimals checks
    }

    function _isETH(bytes32 _ccy) internal pure returns (bool) {
        return _ccy == "ETH";
    }
}
