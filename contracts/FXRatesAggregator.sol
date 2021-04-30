// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./ProtocolTypes.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV2V3Interface.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @dev FX Rates Aggregator contract is using for accessing Chainlink price feeds  
 * prices in USD/ETH for Secured Finance protocol and converts 
 * FX rates to USDT/USDC/ETH internally
 *
 * Contract stores chainlink price feeds by ccy in usdPriceFeeds and ethPriceFeeds mappings.
 */
contract FXRatesAggregator is ProtocolTypes {
    using SignedSafeMath for int256;
    using SafeMath for uint256;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event PriceFeedAdded(Ccy ccy, address indexed priceFeed);

    address public owner;
    address internal zeroAddr = 0x0000000000000000000000000000000000000000;
    uint256 internal decimalBase = 10**18;

    mapping(Ccy => AggregatorV2V3Interface) public usdPriceFeeds;
    mapping(Ccy => AggregatorV2V3Interface) public ethPriceFeeds;
    mapping(Ccy => uint8) public decimals;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

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

    // =========== SET CHAINLINK PRICE FEED FUNCTIONS ===========

    /**
    * @dev Links the contract to existing chainlink price feed.
    * @param _ccy Specified currency
    * @param _priceFeedAddr Chainlink price feed contract address
    * @param _isEthPriceFeed Boolean for price feed with ETH price
    */
    function linkPriceFeed(Ccy _ccy, address _priceFeedAddr, bool _isEthPriceFeed) public onlyOwner returns (bool) {
        require(_priceFeedAddr != address(0), "Couldn't link 0x0 address");
        AggregatorV2V3Interface priceFeed = AggregatorV2V3Interface(_priceFeedAddr);
        if (_isEthPriceFeed == true) {
            require(_ccy != Ccy.ETH, "Can't link ETH price feed for ETH");
            ethPriceFeeds[_ccy] = priceFeed;
        } else {
            usdPriceFeeds[_ccy] = priceFeed;
        }

        emit PriceFeedAdded(_ccy, _priceFeedAddr);
        return true;
    }

    // =========== GET PRICE FUNCTIONS ===========

    /**
    * @dev Triggers to get last price in USD for selected currency.
    * @param _ccy Currency
    */
    function getLastUSDPrice(Ccy _ccy) public view returns (int256) {
        AggregatorV2V3Interface priceFeed = usdPriceFeeds[_ccy];
        int256 price =  priceFeed.latestAnswer();

        return price;
    }

    /**
    * @dev Triggers to get historical price in USD for selected currency.
    * @param _ccy Currency
    * @param _roundId RoundId
    */
    function getHistoricalUSDPrice(Ccy _ccy, uint80 _roundId) public view returns (int256) {
        AggregatorV3Interface priceFeed = usdPriceFeeds[_ccy];
        (
            uint80 roundID, 
            int price,
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) =  priceFeed.getRoundData(_roundId);

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
    * @dev Triggers to get last price in ETH for selected currency.
    * @param _ccy Currency
    */
    function getLastETHPrice(Ccy _ccy) public view returns (int256) {
        if (_ccy == Ccy.ETH) {
            return 1;
        } else {
            AggregatorV2V3Interface priceFeed = ethPriceFeeds[_ccy];
            int256 price =  priceFeed.latestAnswer();

            return price;
        }
    }

    /**
    * @dev Triggers to get historical price in ETH for selected currency.
    * @param _ccy Currency
    * @param _roundId RoundId
    */
    function getHistoricalETHPrice(Ccy _ccy, uint80 _roundId) public view returns (int256) {
        if (_ccy == Ccy.ETH) {
            return 1;
        } else {
            AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
            (
                uint80 roundID, 
                int price,
                uint startedAt,
                uint timeStamp,
                uint80 answeredInRound
            ) =  priceFeed.getRoundData(_roundId);

            require(timeStamp > 0, "Round not completed yet");
            return price;
        }
    }

    /**
    * @dev Triggers to get converted amount of currency in ETH.
    * @param _ccy Currency that has to be convered to ETH
    * @param _amount Amount of funds to be converted
    */
    function convertToETH(Ccy _ccy, uint256 _amount) public view returns (uint256) {
        if (_ccy == Ccy.ETH) {
            return _amount;
        } else {
            AggregatorV2V3Interface priceFeed = ethPriceFeeds[_ccy];
            int256 price =  priceFeed.latestAnswer();

            return _amount.mul(uint256(price)).div(decimalBase);
        }
    }
}