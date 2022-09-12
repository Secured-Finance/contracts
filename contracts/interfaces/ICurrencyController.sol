// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";

/**
 * @dev Currency Controller contract is responsible for managing supported
 * currencies in Secured Finance Protocol
 *
 * Contract links new currencies to ETH Chainlink price feeds, without existing price feed
 * contract owner is not able to add a new currency into the protocol
 */
interface ICurrencyController {
    event CcyAdded(bytes32 indexed ccy, string name, uint256 haircut);
    event CcySupportUpdate(bytes32 indexed ccy, bool isSupported);
    event HaircutUpdated(bytes32 indexed ccy, uint256 haircut);
    event PriceFeedAdded(bytes32 ccy, string secondCcy, address indexed priceFeed);
    event PriceFeedRemoved(bytes32 ccy, string secondCcy, address indexed priceFeed);

    function convertFromETH(bytes32 _ccy, uint256 _amountETH) external view returns (uint256);

    function convertToETH(bytes32 _ccy, uint256 _amount) external view returns (uint256);

    function convertToETH(bytes32 _ccy, int256 _amount) external view returns (int256);

    function getCurrencies(bytes32) external view returns (ProtocolTypes.Currency memory);

    function getEthDecimals(bytes32) external view returns (uint8);

    function getUsdDecimals(bytes32) external view returns (uint8);

    function getHaircut(bytes32 _ccy) external view returns (uint256);

    function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256);

    function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256);

    function getLastETHPrice(bytes32 _ccy) external view returns (int256);

    function getLastUSDPrice(bytes32 _ccy) external view returns (int256);

    function isSupportedCcy(bytes32 _ccy) external view returns (bool);

    function linkPriceFeed(
        bytes32 _ccy,
        address _priceFeedAddr,
        bool _isEthPriceFeed
    ) external returns (bool);

    function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed) external;

    function supportCurrency(
        bytes32 _ccy,
        string memory _name,
        address _ethPriceFeed,
        uint256 _haircut
    ) external;

    function updateCcyHaircut(bytes32 _ccy, uint256 _haircut) external;

    function updateCurrencySupport(bytes32 _ccy, bool _isSupported) external;
}
