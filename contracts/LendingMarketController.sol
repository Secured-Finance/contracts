// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController, Order} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinGenesisValue} from "./mixins/MixinGenesisValue.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "./storages/LendingMarketControllerStorage.sol";

/**
 * @notice Implements the module to manage separated lending order-book markets per maturity.
 *
 * This contract also works as a factory contract that can deploy (start) a new lending market
 * for selected currency and maturity and has the calculation logic for the Genesis value in addition.
 *
 * Deployed Lending Markets are rotated and reused as it reaches the maturity date. At the time of rotation,
 * a new maturity date is set and the compound factor is updated.
 *
 * The users mainly call this contract to create orders to lend or borrow funds.
 */
contract LendingMarketController is
    ILendingMarketController,
    MixinAddressResolver,
    MixinGenesisValue,
    ReentrancyGuard,
    Ownable,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;
    uint256 private constant BASIS_TERM = 3;

    /**
     * @notice Modifier to check if the currency has a lending market.
     * @param _ccy Currency name in bytes32
     */
    modifier hasLendingMarket(bytes32 _ccy) {
        require(
            Storage.slot().lendingMarkets[_ccy].length > 0,
            "No lending markets exist for a specific currency"
        );
        _;
    }

    /**
     * @notice Modifier to check if there is a market in the maturity.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     */
    modifier ifValidMaturity(bytes32 _ccy, uint256 _maturity) {
        require(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity] != address(0),
            "Invalid maturity"
        );
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _owner, address _resolver) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.BEACON_PROXY_CONTROLLER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.TOKEN_VAULT;
    }

    /**
     * @notice Gets the basis date when the first market opens for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return The basis date
     */
    function getBasisDate(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().basisDates[_ccy];
    }

    /**
     * @notice Gets the lending market contract addresses for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending market address
     */
    function getLendingMarkets(bytes32 _ccy) external view override returns (address[] memory) {
        return Storage.slot().lendingMarkets[_ccy];
    }

    /**
     * @notice Gets the lending market contract address for the selected currency and maturity.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @return The lending market address
     */
    function getLendingMarket(bytes32 _ccy, uint256 _maturity)
        external
        view
        override
        returns (address)
    {
        return Storage.slot().maturityLendingMarkets[_ccy][_maturity];
    }

    /**
     * @notice Gets borrow rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the borrowing rate of the lending market
     */
    function getBorrowRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
     * @notice Gets lend rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending rate of the lending market
     */
    function getLendRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
     * @notice Gets mid rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the mid rate of the lending market
     */
    function getMidRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getMidRate();
        }

        return rates;
    }

    /**
     * @notice Gets maturities for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending market maturity
     */
    function getMaturities(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory maturities = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            maturities[i] = market.getMaturity();
        }

        return maturities;
    }

    /**
     * @notice Gets the total present value of the account for selected currency.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _account Target account address
     * @return totalPresentValue The total present value
     */
    function getTotalPresentValue(bytes32 _ccy, address _account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address marketAddr = Storage.slot().lendingMarkets[_ccy][i];
            totalPresentValue += ILendingMarket(marketAddr).presentValueOf(_account);
        }
    }

    /**
     * @notice Gets the total present value of the account converted to ETH.
     * @param _account Target account address
     * @return totalPresentValue The total present value in ETH
     */
    function getTotalPresentValueInETH(address _account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_account];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            int256 amount = getTotalPresentValue(ccy, _account);
            totalPresentValue += currencyController().convertToETH(ccy, amount);
        }
    }

    /**
     * @notice Gets if the lending market is initialized.
     * @param _ccy Currency name in bytes32
     * @return The boolean if the lending market is initialized or not
     */
    function isInitializedLendingMarket(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().basisDates[_ccy] != 0;
    }

    /**
     * @notice Initialize the lending market to set a basis date and compound factor
     * @param _ccy Currency name in bytes32
     * @param _basisDate The basis date when the initial market is opened
     * @param _compoundFactor The initial compound factor when the initial market is opened
     */
    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _compoundFactor
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(!isInitializedLendingMarket(_ccy), "Already initialized");

        _registerCurrency(_ccy, 18, _compoundFactor);
        Storage.slot().basisDates[_ccy] = _basisDate;
    }

    /**
     * @notice Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     * @notice Reverts on deployment market with existing currency and term
     * @return market The proxy contract address of created lending market
     */
    function createLendingMarket(bytes32 _ccy)
        external
        override
        onlyOwner
        returns (address market)
    {
        require(
            isRegisteredCurrency(_ccy),
            "Lending market hasn't been initialized in the currency"
        );
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");

        uint256 basisDate = Storage.slot().basisDates[_ccy];

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            basisDate = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        uint256 nextMaturity = TimeLibrary.addMonths(basisDate, BASIS_TERM);

        market = beaconProxyController().deployLendingMarket(
            _ccy,
            Storage.slot().basisDates[_ccy],
            nextMaturity
        );

        Storage.slot().lendingMarkets[_ccy].push(market);
        Storage.slot().maturityLendingMarkets[_ccy][nextMaturity] = market;

        emit LendingMarketCreated(
            _ccy,
            market,
            Storage.slot().lendingMarkets[_ccy].length,
            nextMaturity
        );
        return market;
    }

    /**
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     *
     * In addition, converts the future value to the genesis value if there is future value in past maturity
     * before the execution of order creation.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        return _createOrder(_ccy, _maturity, _side, _amount, _rate);
    }

    /**
     * @notice Creates the lend order with ETH. Takes the order if the order is matched,
     * and places new order if not match it.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _rate
    ) external payable override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        return _createOrder(_ccy, _maturity, ProtocolTypes.Side.LEND, msg.value, _rate);
    }

    /**
     * @notice Gets if the market order will be matched or not.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function matchOrders(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external view override ifValidMaturity(_ccy, _maturity) returns (bool) {
        address marketAddr = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        ILendingMarket(marketAddr).matchOrders(_side, _amount, _rate);

        return true;
    }

    /**
     * @notice Cancels the own order.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _orderId Market order id
     */
    function cancelOrder(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _orderId
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        address marketAddr = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        (ProtocolTypes.Side side, uint256 amount, uint256 rate) = ILendingMarket(marketAddr)
            .cancelOrder(msg.sender, _orderId);

        if (side == ProtocolTypes.Side.LEND) {
            tokenVault().removeEscrowedAmount(msg.sender, msg.sender, _ccy, amount);
        } else {
            tokenVault().releaseUnsettledCollateral(msg.sender, _ccy, amount, true);
        }

        emit OrderCanceled(_orderId, msg.sender, _ccy, side, _maturity, amount, rate);

        return true;
    }

    /**
     * @notice Rotate the lending markets. In this rotation, the following actions are happened.
     * - Updates the maturity at the beginning of the market array.
     * - Moves the beginning of the market array to the end of it.
     * - Update the compound factor in this contract using the next market rate.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     */
    function rotateLendingMarkets(bytes32 _ccy)
        external
        override
        nonReentrant
        hasLendingMarket(_ccy)
    {
        address[] storage markets = Storage.slot().lendingMarkets[_ccy];
        address currentMarketAddr = markets[0];
        address nextMarketAddr = markets[1];

        // Reopen the market matured with new maturity
        uint256 newLastMaturity = TimeLibrary.addMonths(
            ILendingMarket(markets[markets.length - 1]).getMaturity(),
            BASIS_TERM
        );
        uint256 prevMaturity = ILendingMarket(currentMarketAddr).openMarket(newLastMaturity);

        // Rotate the order of the market
        for (uint256 i = 0; i < markets.length; i++) {
            address marketAddr = (markets.length - 1) == i ? currentMarketAddr : markets[i + 1];
            markets[i] = marketAddr;
        }

        _updateCompoundFactor(
            _ccy,
            prevMaturity,
            ILendingMarket(nextMarketAddr).getMaturity(),
            ILendingMarket(nextMarketAddr).getMidRate()
        );

        Storage.slot().maturityLendingMarkets[_ccy][newLastMaturity] = currentMarketAddr;
        delete Storage.slot().maturityLendingMarkets[_ccy][prevMaturity];

        emit LendingMarketsRotated(_ccy, prevMaturity, newLastMaturity);
    }

    /**
     * @notice Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     * @return True if the execution of the operation succeeds
     */
    function pauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.pauseMarket();
        }

        return true;
    }

    /**
     * @notice Unpauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     * @return True if the execution of the operation succeeds
     */
    function unpauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.unpauseMarket();
        }

        return true;
    }

    /**
     * @notice Converts FutureValue to GenesisValue if there is balance in the past maturity.
     * @param _user User's address
     */
    function convertFutureValueToGenesisValue(address _user) external nonReentrant {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory maturities = getMaturities(ccy);

            for (uint256 j = 0; j < maturities.length; j++) {
                address marketAddr = Storage.slot().maturityLendingMarkets[ccy][maturities[j]];
                _convertFutureValueToGenesisValue(ccy, marketAddr, _user);
            }
            if (getGenesisValue(ccy, _user) == 0) {
                Storage.slot().usedCurrencies[_user].remove(ccy);
            }
        }
    }

    /**
     * @notice Converts the future value to the genesis value if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _marketAddr Market contract address
     * @param _user User's address
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        address _marketAddr,
        address _user
    ) private {
        (int256 removedAmount, uint256 basisMaturity) = ILendingMarket(_marketAddr)
            .removeFutureValueInPastMaturity(_user);

        if (removedAmount != 0) {
            _addGenesisValue(_ccy, _user, basisMaturity, removedAmount);
        }
    }

    function _createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) private returns (bool) {
        _convertFutureValueToGenesisValue(
            _ccy,
            Storage.slot().maturityLendingMarkets[_ccy][_maturity],
            msg.sender
        );

        // Create a order
        (uint256 orderId, address maker, uint256 matchedAmount) = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ).createOrder(_side, msg.sender, _amount, _rate);

        // Update the unsettled collateral in TokenVault
        if (matchedAmount == 0) {
            if (_side == ProtocolTypes.Side.LEND) {
                tokenVault().addEscrowedAmount{value: msg.value}(maker, _ccy, _amount);
            } else {
                tokenVault().useUnsettledCollateral(maker, _ccy, _amount);
            }

            emit OrderPlaced(orderId, maker, _ccy, _side, _maturity, _amount, _rate);
        } else {
            if (_side == ProtocolTypes.Side.LEND) {
                tokenVault().releaseUnsettledCollateral(maker, _ccy, _amount, false);
            } else {
                tokenVault().removeEscrowedAmount(maker, msg.sender, _ccy, _amount);
            }

            Storage.slot().usedCurrencies[msg.sender].add(_ccy);
            Storage.slot().usedCurrencies[maker].add(_ccy);

            emit OrderFilled(
                orderId,
                maker,
                msg.sender,
                _ccy,
                _side,
                _maturity,
                matchedAmount,
                _rate
            );
        }

        return true;
    }
}
