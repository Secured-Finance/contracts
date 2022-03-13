// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./ProtocolTypes.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
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
    event PriceFeedAdded(Ccy ccy, string secondCcy, address indexed priceFeed);
    event PriceFeedRemoved(
        Ccy ccy,
        string secondCcy,
        address indexed priceFeed
    );

    address public owner;

    mapping(Ccy => AggregatorV3Interface) public usdPriceFeeds;
    mapping(Ccy => AggregatorV3Interface) public ethPriceFeeds;
    mapping(Ccy => uint8) public usdDecimals;
    mapping(Ccy => uint8) public ethDecimals;

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
    function linkPriceFeed(
        Ccy _ccy,
        address _priceFeedAddr,
        bool _isEthPriceFeed
    ) public onlyOwner returns (bool) {
        require(_priceFeedAddr != address(0), "Couldn't link 0x0 address");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_priceFeedAddr);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price >= 0, "PriceFeed is invalid");

        uint8 decimals = priceFeed.decimals();
        require(decimals <= 18, "PriceFeed decimals is invalid");

        if (_isEthPriceFeed) {
            require(_ccy != Ccy.ETH, "Can't link ETH PriceFeed");
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
    function removePriceFeed(Ccy _ccy, bool _isEthPriceFeed)
        external
        onlyOwner
    {
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
    function getLastUSDPrice(Ccy _ccy) public view returns (int256) {
        AggregatorV3Interface priceFeed = usdPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
    }

    /**
     * @dev Triggers to get historical price in USD for selected currency.
     * @param _ccy Currency
     * @param _roundId RoundId
     */
    function getHistoricalUSDPrice(Ccy _ccy, uint80 _roundId)
        public
        view
        returns (int256)
    {
        AggregatorV3Interface priceFeed = usdPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) = priceFeed.getRoundData(
            _roundId
        );

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
     * @dev Triggers to get last price in ETH for selected currency.
     * @param _ccy Currency
     */
    function getLastETHPrice(Ccy _ccy) public view returns (int256) {
        if (_isETH(_ccy)) return 1;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
    }

    /**
     * @dev Triggers to get historical price in ETH for selected currency.
     * @param _ccy Currency
     * @param _roundId RoundId
     */
    function getHistoricalETHPrice(Ccy _ccy, uint80 _roundId)
        public
        view
        returns (int256)
    {
        if (_isETH(_ccy)) return 1;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, , uint256 timeStamp, ) = priceFeed.getRoundData(
            _roundId
        );

        require(timeStamp > 0, "Round not completed yet");
        return price;
    }

    /**
     * @dev Triggers to get converted amount of currency in ETH.
     * @param _ccy Currency that has to be convered to ETH
     * @param _amount Amount of funds to be converted
     */
    function convertToETH(Ccy _ccy, uint256 _amount)
        public
        view
        returns (uint256)
    {
        if (_isETH(_ccy)) return _amount;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return _amount.mul(uint256(price)).div(1e18);
    }

    /**
     * @dev Triggers to get converted amount of currency in ETH.
     * @param _ccy Currency that has to be convered to ETH
     * @param _amounts Amount of funds to be converted
     */
    function convertBulkToETH(Ccy _ccy, uint256[] memory _amounts)
        public
        view
        returns (uint256[] memory)
    {
        if (_isETH(_ccy)) return _amounts;

        AggregatorV3Interface priceFeed = ethPriceFeeds[_ccy];
        (, int256 price, , , ) = priceFeed.latestRoundData();
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

    function _isETH(Ccy _ccy) internal pure returns (bool) {
        return _ccy == Ccy.ETH;
    }
}
