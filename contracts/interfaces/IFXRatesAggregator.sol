// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFXRatesAggregator {
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event PriceFeedAdded(uint8 ccy, address indexed priceFeed);

    function decimals(uint8) external view returns (uint8);

    function ethPriceFeeds(uint8) external view returns (address);

    function usdPriceFeeds(uint8) external view returns (address);

    function owner() external view returns (address);

    function setOwner(address _owner) external;

    function linkPriceFeed(
        uint8 _ccy,
        address _priceFeedAddr,
        bool _isEthPriceFeed
    ) external returns (bool);

    function getLastUSDPrice(uint8 _ccy) external view returns (int256);

    function getHistoricalUSDPrice(uint8 _ccy, uint80 _roundId) external view returns (int256);

    function getLastETHPrice(uint8 _ccy) external view returns (int256);

    function getHistoricalETHPrice(uint8 _ccy, uint80 _roundId) external view returns (int256);

    function convertToETH(uint8 _ccy, uint256 _amount) external view returns (uint256);

    function convertBulkToETH(uint8 _ccy, uint256[] memory _amounts)
        external
        view
        returns (uint256[] memory);
}
