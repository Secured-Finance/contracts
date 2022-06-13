// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces/ICurrencyController.sol";
import "./utils/Ownable.sol";
import "./utils/Proxyable.sol";
import {CurrencyControllerStorage as Storage} from "./storages/CurrencyControllerStorage.sol";

/**
 * @dev Currency Controller contract is responsible for managing supported
 * currencies in Secured Finance Protocol
 *
 * Contract links new currencies to ETH Chainlink price feeds, without existing price feed
 * contract owner is not able to add a new currency into the protocol
 */
contract CurrencyController is ICurrencyController, Ownable, Proxyable {
    modifier supportedCcyOnly(bytes32 _ccy) {
        require(isSupportedCcy(_ccy), "Unsupported asset");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address owner) public initializer onlyProxy {
        _transferOwnership(owner);
    }

    // =========== CURRENCY CONTROL SECTION ===========

    /**
     * @dev Triggers to add new currency into the protocol. Links with existing ETH chainlink pricefeed
     * @param _ccy Currency short ticket
     * @param _name Currency full name
     * @param _chainId Chain ID for conversion from bytes32 to bytes
     * @param _ethPriceFeed Address for ETH price feed
     */
    function supportCurrency(
        bytes32 _ccy,
        string memory _name,
        uint16 _chainId,
        address _ethPriceFeed,
        uint256 _haircut,
        address _tokenAddress
    ) public override onlyOwner {
        ProtocolTypes.Currency memory currency;
        currency.name = _name;
        if (_chainId != 0) {
            currency.chainId = _chainId;
        }

        if (_tokenAddress != address(0)) {
            Storage.slot().tokenAddresses[_ccy] = _tokenAddress;
        }

        currency.isSupported = true;

        Storage.slot().currencies[_ccy] = currency;
        Storage.slot().haircuts[_ccy] = _haircut;

        if (_ccy != "ETH") {
            require(linkPriceFeed(_ccy, _ethPriceFeed, true), "Invalid PriceFeed");
        } else {
            require(linkPriceFeed(_ccy, _ethPriceFeed, false), "Invalid PriceFeed");
        }
        emit CcyAdded(_ccy, _name, _chainId, _haircut);
    }

    /**
     * @dev Triggers to update currency support
     * @param _ccy Currency short ticket
     * @param _isSupported Boolean whether currency supported as collateral or not
     */
    function updateCurrencySupport(bytes32 _ccy, bool _isSupported) public override onlyOwner {
        ProtocolTypes.Currency storage currency = Storage.slot().currencies[_ccy];
        currency.isSupported = _isSupported;

        emit CcySupportUpdate(_ccy, _isSupported);
    }

    /**
     * @dev Triggers to update if currency is accepted as collateral
     * @param _ccy Currency short ticket
     * @param _isSupported Boolean whether currency supported as collateral or not
     */
    function updateCollateralSupport(bytes32 _ccy, bool _isSupported)
        public
        override
        onlyOwner
        supportedCcyOnly(_ccy)
    {
        Storage.slot().isCollateral[_ccy] = _isSupported;

        emit CcyCollateralUpdate(_ccy, _isSupported);
    }

    /**
     * @dev Triggers to update the haircut ratio for supported currency
     * @param _ccy Currency short ticket
     * @param _haircut Currency haircut ratio used to calculate in collateral calculations
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
     * @dev Triggers to update the minimal margin requirements for currency supported as collateral
     * @param _ccy Currency short ticket
     * @param _minMargin Currency minimal margin ratio used to calculate collateral coverage
     */
    function updateMinMargin(bytes32 _ccy, uint256 _minMargin)
        public
        override
        onlyOwner
        supportedCcyOnly(_ccy)
    {
        require(_minMargin > 0, "Incorrect MinMargin");
        require(_minMargin <= 10000, "MinMargin overflow");
        require(isCollateral(_ccy), "Unable to set MinMargin");

        Storage.slot().minMargins[_ccy] = _minMargin;

        emit MinMarginUpdated(_ccy, _minMargin);
    }

    // =========== EXTERNAL GET FUNCTIONS ===========

    /**
     * @dev Triggers to get specified currency.
     * @param _ccy Currency short ticket
     */
    function getCurrencies(bytes32 _ccy)
        external
        view
        returns (ProtocolTypes.Currency memory currency)
    {
        currency = Storage.slot().currencies[_ccy];
    }

    /**
     * @dev Triggers to get ETH decimal for specific currency.
     * @param _ccy Currency short ticket
     */
    function getEthDecimals(bytes32 _ccy) external view returns (uint8) {
        return Storage.slot().ethDecimals[_ccy];
    }

    /**
     * @dev Triggers to get USD decimal for specific currency.
     * @param _ccy Currency short ticket
     */
    function getUsdDecimals(bytes32 _ccy) external view returns (uint8) {
        return Storage.slot().usdDecimals[_ccy];
    }

    /**
     * @dev Triggers to get haircut ratio for specific currency.
     * Haircut is used in bilateral netting cross-calculation.
     * @param _ccy Currency short ticket
     */
    function getHaircut(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().haircuts[_ccy];
    }

    /**
     * @dev Triggers to get minimal margin percentage for specific currency.
     * @param _ccy Currency short ticket
     */
    function getMinMargin(bytes32 _ccy) external view override returns (uint256) {
        require(isCollateral(_ccy), "Unable to get MinMargin");
        return Storage.slot().minMargins[_ccy];
    }

    /**
     * @dev Triggers to get token address for specific currency.
     * @param _ccy Currency short ticket
     */
    function getTokenAddresses(bytes32 _ccy) external view returns (address) {
        return Storage.slot().tokenAddresses[_ccy];
    }

    /**
     * @dev Triggers to get if specified currency is supported.
     * @param _ccy Currency short ticket
     */
    function isSupportedCcy(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().currencies[_ccy].isSupported;
    }

    /**
     * @dev Triggers to get if specified currency is collateral.
     * @param _ccy Currency short ticket
     */
    function isCollateral(bytes32 _ccy) public view returns (bool) {
        return Storage.slot().isCollateral[_ccy];
    }

    /**
     * @dev Triggers to get chainId for a specific currency.
     * Chain ID is a unique identifier of another chain like Bitcoin, Filecoin, etc.
     * @param _ccy Currency short ticket
     */
    function getChainId(bytes32 _ccy) external view override returns (uint16) {
        return Storage.slot().currencies[_ccy].chainId;
    }

    // =========== CHAINLINK PRICE FEED FUNCTIONS ===========
    // TODO: add additional price feeds in case if chainlink is not reliable

    /**
     * @dev Links the contract to existing chainlink price feed.
     * @param _ccy Specified currency short code
     * @param _priceFeedAddr Chainlink price feed contract address
     * @param _isEthPriceFeed Boolean for price feed with ETH price
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
     * @dev Triggers to remove existing chainlink price feed.
     * @param _ccy Specified currency
     * @param _isEthPriceFeed Boolean for price feed with ETH price
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

    // =========== GET PRICE FUNCTIONS ===========

    /**
     * @dev Triggers to get last price in USD for selected currency.
     * @param _ccy Currency
     */
    function getLastUSDPrice(bytes32 _ccy) public view override returns (int256) {
        AggregatorV3Interface priceFeed = Storage.slot().usdPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
    }

    /**
     * @dev Triggers to get historical price in USD for selected currency.
     * @param _ccy Currency
     * @param _roundId RoundId
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
     * @dev Triggers to get last price in ETH for selected currency.
     * @param _ccy Currency
     */
    function getLastETHPrice(bytes32 _ccy) public view override returns (int256) {
        if (_isETH(_ccy)) return 1e18;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
    }

    /**
     * @dev Triggers to get historical price in ETH for selected currency.
     * @param _ccy Currency
     * @param _roundId RoundId
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
     * @dev Triggers to get converted amount of currency in ETH.
     * @param _ccy Currency that has to be convered to ETH
     * @param _amount Amount of funds to be converted
     */
    function convertToETH(bytes32 _ccy, uint256 _amount) public view override returns (uint256) {
        if (_isETH(_ccy)) return _amount;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return (_amount * uint256(price)) / 1e18;
    }

    /**
     * @dev Triggers to get converted amounts of currency to ETH.
     * @param _ccy Currency that has to be convered to ETH
     * @param _amounts Array with amounts of funds to be converted
     */
    function convertBulkToETH(bytes32 _ccy, uint256[] memory _amounts)
        public
        view
        override
        returns (uint256[] memory)
    {
        if (_isETH(_ccy)) return _amounts;

        AggregatorV3Interface priceFeed = Storage.slot().ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint256[] memory amounts = new uint256[](_amounts.length);

        for (uint256 i = 0; i < _amounts.length; i++) {
            uint256 amount = _amounts[i];

            if (amount > 0) {
                amounts[i] = (amount * uint256(price)) / 1e18;
            } else {
                amounts[i] = 0;
            }
        }

        return amounts;
    }

    /**
     * @dev Triggers to convert ETH amount of funds to specified currency.
     * @param _ccy Currency that has to be convered from ETH
     * @param _amountETH Amount of funds in ETH to be converted
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
