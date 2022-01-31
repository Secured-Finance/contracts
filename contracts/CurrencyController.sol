// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @dev Currency Controller contract is responsible for managing supported 
 * currencies in Secured Finance Protocol
 *
 * Contract links new currencies to ETH Chainlink price feeds, without existing price feed 
 * contract owner is not able to add a new currency into the protocol
 */
contract CurrencyController {
    using SignedSafeMath for int256;
    using SafeMath for uint256;

    event CcyAdded(bytes32 indexed ccy, string name, uint16 chainId, uint256 ltv);
    event LTVUpdated(bytes32 indexed ccy, uint256 ltv);
    event MinMarginUpdated(bytes32 indexed ccy, uint256 minMargin);

    event CcySupportUpdate(bytes32 indexed ccy, bool isSupported);
    event CcyCollateralUpdate(bytes32 indexed ccy, bool isCollateral);

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    event PriceFeedAdded(bytes32 ccy, string secondCcy, address indexed priceFeed);
    event PriceFeedRemoved(bytes32 ccy, string secondCcy, address indexed priceFeed);

    address public owner;
    uint8 public last_ccy_index;

    struct Currency {
        bool isSupported;
        string name;
        uint16 chainId; // chain id for address conversion
    }

    // Protocol currencies storage
    mapping(bytes32 => Currency) public currencies;
    mapping(bytes32 => uint256) public ltvs;
    mapping(bytes32 => uint256) public minMargins;
    mapping(bytes32 => bool) public isCollateral;

    // PriceFeed storage
    mapping(bytes32 => AggregatorV3Interface) public usdPriceFeeds;
    mapping(bytes32 => AggregatorV3Interface) public ethPriceFeeds;
    mapping(bytes32 => uint8) public usdDecimals;
    mapping(bytes32 => uint8) public ethDecimals;

    uint8 public supportedCurrencies;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier supportedCcyOnly(bytes32 _ccy) {
        require(isSupportedCcy(_ccy), "Unsupported asset");
        _;
    }

    /**
    * @dev Lending Market Controller Constructor.
    */
    constructor() public {
        owner = msg.sender;
    }

    /**
    * @dev Sets owner of the controller market.
    * @param _owner Address of new owner
    */
    function setOwner(address _owner) public onlyOwner {
        require(_owner != address(0), "new owner is the zero address");
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    // =========== CURRENCY CONTROL SECTION ===========

    /**
    * @dev Triggers to add new currency into the protocol. Links with existing ETH chainlink pricefeed
    * @param _ccy Currency short ticket
    * @param _name Currency full name 
    * @param _chainId Chain ID for conversion from bytes32 to bytes
    * @param _ethPriceFeed Address for ETH price feed   
    */
    function supportCurrency(bytes32 _ccy, string memory _name, uint16 _chainId, address _ethPriceFeed, uint256 _ltv) onlyOwner public returns (bool) {
        last_ccy_index = last_ccy_index++;

        Currency memory currency;
        currency.name = _name;
        currency.chainId = _chainId;
        currency.isSupported = true;

        currencies[_ccy] = currency;
        ltvs[_ccy] = _ltv;

        if (_ccy != "ETH") {
            require(linkPriceFeed(_ccy, _ethPriceFeed, true), "Invalid PriceFeed");
        } else {
            require(linkPriceFeed(_ccy, _ethPriceFeed, false), "Invalid PriceFeed");
        }
        emit CcyAdded(_ccy, _name, _chainId, _ltv);
    }

    /**
    * @dev Triggers to update currency support
    * @param _ccy Currency short ticket
    * @param _isSupported Boolean whether currency supported as collateral or not   
    */
    function updateCurrencySupport(bytes32 _ccy, bool _isSupported) onlyOwner public returns (bool) {
        Currency storage currency = currencies[_ccy];
        currency.isSupported = _isSupported;

        emit CcySupportUpdate(_ccy, _isSupported);
    }

    /**
    * @dev Triggers to update if currency is accepted as collateral
    * @param _ccy Currency short ticket
    * @param _isSupported Boolean whether currency supported as collateral or not   
    */
    function updateCollateralSupport(bytes32 _ccy, bool _isSupported) onlyOwner supportedCcyOnly(_ccy) public returns (bool) {
        isCollateral[_ccy] = _isSupported;

        emit CcyCollateralUpdate(_ccy, _isSupported);
    }

    /**
    * @dev Triggers to update the loan-to-value ratio for supported currency
    * @param _ccy Currency short ticket
    * @param _ltv Currency LTV value used to calculate in collateral calculations
    */
    function updateCcyLTV(bytes32 _ccy, uint256 _ltv) onlyOwner supportedCcyOnly(_ccy) public returns (bool) {
        require(_ltv > 0, "Incorrect LTV");
        require(_ltv <= 10000, "LTV overflow");
        
        ltvs[_ccy] = _ltv;

        emit LTVUpdated(_ccy, _ltv);
    }

    /**
    * @dev Triggers to update the minimal margin requirements for currency supported as collateral
    * @param _ccy Currency short ticket
    * @param _minMargin Currency minimal margin ratio used to calculate collateral coverage
    */
    function updateMinMargin(bytes32 _ccy, uint256 _minMargin) onlyOwner supportedCcyOnly(_ccy) public returns (bool) {
        require(_minMargin > 0, "Incorrect MinMargin");
        require(_minMargin <= 10000, "MinMargin overflow");
        require(isCollateral[_ccy], "Unable to set MinMargin");

        minMargins[_ccy] = _minMargin;

        emit MinMarginUpdated(_ccy, _minMargin);
    }

    // =========== EXTERNAL GET FUNCTIONS ===========

    /**
    * @dev Triggers to get LTV percentage for specific currency. 
    * LTV is used to apply haircut percentage on bilateral netting cross-calculation.
    * @param _ccy Currency short ticket
    */
    function getLTV(bytes32 _ccy) external view returns (uint256) {
        return ltvs[_ccy];
    }

    /**
    * @dev Triggers to get minimal margin percentage for specific currency.
    * @param _ccy Currency short ticket
    */
    function getMinMargin(bytes32 _ccy) external view returns (uint256) {
        require(isCollateral[_ccy], "Unable to get MinMargin");
        return minMargins[_ccy];
    }

    /**
    * @dev Triggers to get if specified currency is supported.
    * @param _ccy Currency short ticket
    */
    function isSupportedCcy(bytes32 _ccy) public view returns (bool) {
        return currencies[_ccy].isSupported;
    }

    // =========== CHAINLINK PRICE FEED FUNCTIONS ===========
    // TODO: add additional price feeds in case if chainlink is not reliable

    /**
    * @dev Links the contract to existing chainlink price feed.
    * @param _ccy Specified currency short code
    * @param _priceFeedAddr Chainlink price feed contract address
    * @param _isEthPriceFeed Boolean for price feed with ETH price
    */
    function linkPriceFeed(bytes32 _ccy, address _priceFeedAddr, bool _isEthPriceFeed) public onlyOwner returns (bool) {
        require(_priceFeedAddr != address(0), "Couldn't link 0x0 address");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_priceFeedAddr);
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();
        require(price >= 0, "Invalid PriceFeed");

        uint8 decimals = priceFeed.decimals();
        require(decimals <= 18, "Invalid decimals");

        if (_isEthPriceFeed) {
            require(!_isETH(_ccy), "Can't link to ETH");
            ethPriceFeeds[_ccy] = priceFeed;
            ethDecimals[_ccy] = decimals;
            emit PriceFeedAdded(_ccy, "ETH", _priceFeedAddr);
        } else {
            usdPriceFeeds[_ccy] = priceFeed;
            usdDecimals[_ccy] = decimals;
            emit PriceFeedAdded(_ccy, "USD", _priceFeedAddr);
        }

        return true;
    }

    /**
    * @dev Triggers to remove existing chainlink price feed.
    * @param _ccy Specified currency
    * @param _isEthPriceFeed Boolean for price feed with ETH price
    */
    function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed) external onlyOwner supportedCcyOnly(_ccy) {        
        if (_isEthPriceFeed == true) {
            address priceFeed = address(ethPriceFeeds[_ccy]);

            require(priceFeed != address(0), "Invalid PriceFeed");
            delete ethPriceFeeds[_ccy];
            delete ethDecimals[_ccy];

            emit PriceFeedRemoved(_ccy, "ETH", priceFeed);
        } else {
            address priceFeed = address(usdPriceFeeds[_ccy]);

            require(priceFeed != address(0), "Invalid PriceFeed");
            delete usdPriceFeeds[_ccy];
            delete usdDecimals[_ccy];

            emit PriceFeedRemoved(_ccy, "USD", priceFeed);
        }
    }

    // =========== GET PRICE FUNCTIONS ===========

    /**
    * @dev Triggers to get last price in USD for selected currency.
    * @param _ccy Currency
    */
    function getLastUSDPrice(bytes32 _ccy) public view returns (int256) {
        AggregatorV3Interface priceFeed = usdPriceFeeds[_ccy];
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();

        return price;
    }

    /**
    * @dev Triggers to get historical price in USD for selected currency.
    * @param _ccy Currency
    * @param _roundId RoundId
    */
    function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId) public view returns (int256) {
        AggregatorV3Interface priceFeed = usdPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) =  priceFeed.getRoundData(_roundId);

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
    * @dev Triggers to get last price in ETH for selected currency.
    * @param _ccy Currency
    */
    function getLastETHPrice(bytes32 _ccy) public view returns (int256) {
        if(_isETH(_ccy)) return 1e18;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();

        return price;
    }

    /**
    * @dev Triggers to get historical price in ETH for selected currency.
    * @param _ccy Currency
    * @param _roundId RoundId
    */
    function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId) public view returns (int256) {
        if(_isETH(_ccy)) return 1e18;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) =  priceFeed.getRoundData(_roundId);

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
    * @dev Triggers to get converted amount of currency in ETH.
    * @param _ccy Currency that has to be convered to ETH
    * @param _amount Amount of funds to be converted
    */
    function convertToETH(bytes32 _ccy, uint256 _amount) public view returns (uint256) {
        if(_isETH(_ccy)) return _amount;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();

        return _amount.mul(uint256(price)).div(1e18);
    }

    /**
    * @dev Triggers to get converted amounts of currency to ETH.
    * @param _ccy Currency that has to be convered to ETH
    * @param _amounts Array with amounts of funds to be converted
    */
    function convertBulkToETH(bytes32 _ccy, uint256[] memory _amounts) public view returns (uint256[] memory) {
        if(_isETH(_ccy)) return _amounts;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();
        uint256[] memory amounts = new uint256[](_amounts.length);

        for (uint256 i = 0; i < _amounts.length; i++) {
            uint256 amount = _amounts[i];

            if (amount > 0) {
                amounts[i] = amount.mul(uint256(price)).div(1e18);
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
    function convertFromETH(bytes32 _ccy, uint256 _amountETH) public view returns (uint256) {
        if(_isETH(_ccy)) return _amountETH;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, ,  , ) =  priceFeed.latestRoundData();

        return (_amountETH.mul(1e18)).div(uint256(price)); // add decimals checks
    }

    function _isETH(bytes32 _ccy) internal pure returns (bool) {
        return _ccy == "ETH";
    }

}