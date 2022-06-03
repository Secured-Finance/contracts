// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./interfaces/ICurrencyController.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ProtocolTypes.sol";

/**
 * @title Collateral Aggregator contract is used to collect Secured Finance
 * protocol user's collateral in ETH. This contract also handle the
 * coverage calculation against all present values and liquidations
 * using FX rates for all protocol currency pairs to ETH
 *
 * Contract linked to Product based contracts (like Loan, Swap, etc), LendingMarkets, CurrencyController contracts.
 */
contract CollateralAggregator is ProtocolTypes {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using Address for address;

    event Register(address indexed addr, uint256 id, uint256 amount);

    event Deposit(address indexed addr, uint256 amount);
    event PositionDeposit(
        address indexed partyA,
        address indexed partyB,
        uint256 amountA,
        uint256 amountB
    );

    event Rebalance(
        address indexed partyA,
        address indexed partyB,
        uint256 amountA,
        uint256 amountB
    );
    event RebalancePositions(
        address[] fromParties,
        address[] toParties,
        uint256[] fromAmounts,
        uint256[] toAmounts
    );

    event Withdraw(address indexed addr, uint256 amount);
    event PositionWithdraw(
        address indexed partyA,
        address indexed partyB,
        uint256 amountA,
        uint256 amountB
    );

    event UseCollateral(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    );
    event UseUnsettledCollateral(address indexed party, bytes32 ccy, uint256 amount);

    event SettleCollateral(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );

    event Release(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );
    event ReleaseUnsettled(address indexed party, bytes32 ccy, uint256 amount);

    event Liquidate(address indexed from, address indexed to, uint256 amount);
    event LiquidateUnsettled(
        address indexed from,
        address indexed to,
        bytes32 ccy,
        uint256 amount,
        uint256 ethAmount
    );

    event UpdateState(address indexed addr, CollateralState prevState, CollateralState currState);
    event UpdatePV(address indexed addr, uint256 prevPV, uint256 newPV, Ccy ccy);

    /**
     * @dev Global collateral book used to track user's total amount
     * of ETH collateral used across all deals and bilateral positions.
     */
    struct Book {
        uint256 gatewayTokenId; // Civic gateway token ID
        uint256 independentAmount; // available ETH for rebalancing
        uint256 lockedCollateral; // total utilized ETH collateral
    }

    /**
     * @dev Bilateral collateral position keeps track of collateral
     * amounts by each counterparty and bilateral position state
     */
    struct Position {
        uint256 lockedCollateralA;
        uint256 lockedCollateralB;
        // CollateralState stateA;
        // CollateralState stateB;
    }

    /**
     * @dev CcyNetting keeps track of total amount of obligations owed
     * by two counterparties per currency, used to calculate the
     * total amount of collateral coverage in bilateral position
     */
    struct CcyNetting {
        uint256 unsettled0PV;
        uint256 unsettled1PV;
        uint256 party0PV;
        uint256 party1PV;
    }

    // Mapping for all collateral books.
    mapping(address => Book) private books;

    // Mapping for total amount of collateral locked in global collateral book by currency code.
    mapping(address => mapping(bytes32 => uint256)) private unsettledCollateral;

    // Mapping for total amount of collateral locked in global collateral book by currency code.
    mapping(address => EnumerableSet.Bytes32Set) private exposedUnsettledCurrencies;

    // Mapping for all registered books.
    mapping(address => bool) private isRegistered;

    // Mapping for bilateral collateral positions between 2 counterparties.
    mapping(address => mapping(address => Position)) private positions;

    // Mapping for used currencies set in bilateral position.
    mapping(address => mapping(address => EnumerableSet.Bytes32Set)) private exposedCurrencies;

    // Mapping for exposures per currency in bilateral position.
    mapping(address => mapping(address => mapping(bytes32 => CcyNetting))) private ccyNettings;

    uint256 public LQLEVEL; // 120% for liquidation price
    uint256 public MARGINLEVEL; // 150% margin call threshold
    uint256 public AUTOLQLEVEL; // 125% auto liquidation

    address public owner;

    // Linked contract addresses
    ICurrencyController public currencyController;
    EnumerableSet.AddressSet private collateralUsers;

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
     * @dev Modifier to check if msg.sender is collateral user
     */
    modifier acceptedContract() {
        require(collateralUsers.contains(msg.sender), "not allowed to use collateral");
        _;
    }

    /**
     * @dev Modifier to check if collateral book registered for `_user`
     */
    modifier registeredBook(address _user) {
        require(isRegistered[_user], "book not found");
        _;
    }

    /**
     * @dev Modifier to check if collateral book registered for `_user`
     */
    modifier nonRegisteredBook(address _user) {
        require(!isRegistered[_user], "book registered already");
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     */
    constructor() {
        owner = msg.sender;

        LQLEVEL = 12000; // 120% for liquidation price
        MARGINLEVEL = 15000; // 150% margin call threshold
        AUTOLQLEVEL = 12500; // 125% auto liquidatio
    }

    // =========== LINKED CONTRACT MANAGEMENT SECTION ===========

    /**
     * @dev Trigers to add contract address to collateral users address set
     * @param _user Collateral user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addCollateralUser(address _user) public onlyOwner returns (bool) {
        require(_user != address(0), "Zero address");
        require(_user.isContract(), "Can't add non-contract address");
        require(!collateralUsers.contains(_user), "Can't add existing address");
        return collateralUsers.add(_user);
    }

    /**
     * @dev Trigers to remove collateral user from address set
     * @param _user Collateral user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on removing non-existing collateral user
     */
    function removeCollateralUser(address _user) public onlyOwner returns (bool) {
        require(collateralUsers.contains(_user), "Can't remove non-existing user");
        return collateralUsers.remove(_user);
    }

    /**
     * @dev Trigers to check if provided `addr` is a collateral user from address set
     * @param _user Contract address to check if it's a collateral user
     *
     */
    function isCollateralUser(address _user) public view returns (bool) {
        return collateralUsers.contains(_user);
    }

    /**
     * @dev Trigers to add currency controller contract address
     * @param _addr Currency Controller smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function setCurrencyController(address _addr) public onlyOwner {
        require(_addr != address(0), "Zero address");
        require(_addr.isContract(), "Can't add non-contract address");

        currencyController = ICurrencyController(_addr);
    }

    /**
     * @dev Trigers to update liquidation level ratio
     * @param _ratio Liquidation level ratio
     * @notice Trigers only be contract owner
     */
    function updateLiquidationThreshold(uint256 _ratio) public onlyOwner {
        require(_ratio > 0, "Incorrect Ratio");
        require(_ratio < MARGINLEVEL, "Liquidation Price Overflow");

        AUTOLQLEVEL = _ratio;
    }

    /**
     * @dev Trigers to update margin call level
     * @param _ratio Margin call ratio
     * @notice Trigers only be contract owner
     */
    function updateMarginCallThreshold(uint256 _ratio) public onlyOwner {
        require(_ratio > 0, "Incorrect Ratio");

        MARGINLEVEL = _ratio;
    }

    /**
     * @dev Trigers to update liquidation price
     * @param _price Liquidation price in basis point
     * @notice Trigers only be contract owner
     */
    function updateLiquidationPrice(uint256 _price) public onlyOwner {
        require(_price > 0, "Incorrect Ratio");
        require(_price < AUTOLQLEVEL, "Liquidation Price Overflow");

        LQLEVEL = _price;
    }

    // =========== COLLATERAL BOOK SECTION ===========

    /**
     * @dev Register user and store collateral book
     * @param id Gateway token ID for KYC'd addresses
     *
     * @notice Payable function, if user sends ETH msg.value adds to independentAmount
     */
    function register(uint256 id) public payable nonRegisteredBook(msg.sender) {
        _register(id);
    }

    /**
     * @dev Register user without KYC gateway token
     *
     * @notice Payable function, if user sends ETH msg.value adds to independentAmount
     */
    function register() public payable nonRegisteredBook(msg.sender) {
        _register(0);
    }

    /**
     * @dev Deposit ETH collateral for msg.sender in collateral book
     * @notice payable function increases the collateral amount by msg.value
     */
    function deposit() public payable registeredBook(msg.sender) {
        books[msg.sender].independentAmount += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Deposit ETH collateral into bilateral position against counterparty
     * @param _counterparty Counterparty address in bilateral position
     * @notice payable function increases locked collateral by msg.value
     */
    function deposit(address _counterparty) public payable registeredBook(msg.sender) {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(
            msg.sender,
            _counterparty
        );
        books[msg.sender].lockedCollateral += msg.value; // save deposited collateral in global book

        Position storage position = positions[_partyA][_partyB];

        if (!flipped) {
            position.lockedCollateralA += msg.value;
            emit PositionDeposit(_partyA, _partyB, msg.value, 0);
        } else {
            position.lockedCollateralB += msg.value;
            emit PositionDeposit(_partyA, _partyB, 0, msg.value);
        }
    }

    /**
     * @dev Rebalance collateral from msg.sender collateral book to specific bilateral position
     *
     * @notice Triggers by collateral owner
     */
    function rebalanceTo(address _counterparty, uint256 _amount) public registeredBook(msg.sender) {
        _rebalanceFromBook(msg.sender, _counterparty, _amount);
    }

    /**
     * @dev Rebalance collateral from `_mainParty` collateral book to specific bilateral position
     *
     * @notice Triggers only by contracts accepted to use collateral
     */
    function rebalanceTo(
        address _mainParty,
        address _counterparty,
        uint256 _amount
    ) public acceptedContract {
        _rebalanceFromBook(_mainParty, _counterparty, _amount);
    }

    /**
     * @dev Rebalance collateral from one bilateral position with `_fromParty` counterparty
     * to another bilateral position with `_toParty` counterparty
     */
    function rebalanceFrom(
        address _fromParty,
        address _toParty,
        uint256 _amount
    ) public registeredBook(msg.sender) {
        (address _fromPartyA, address _fromPartyB, bool fromFlipped) = _checkAddresses(
            msg.sender,
            _fromParty
        );
        (address _toPartyA, address _toPartyB, bool toFlipped) = _checkAddresses(
            msg.sender,
            _toParty
        );

        (uint256 maxWidthdraw0, uint256 maxWidthdraw1) = _calcMaxCollateralWidthdraw(
            _fromPartyA,
            _fromPartyB
        );

        if (!fromFlipped) {
            require(maxWidthdraw0 >= _amount, "positionFrom uncovered");
            positions[_fromPartyA][_fromPartyB].lockedCollateralA -= _amount;
        } else {
            require(maxWidthdraw1 >= _amount, "positionFrom uncovered");
            positions[_fromPartyA][_fromPartyB].lockedCollateralB -= _amount;
        }

        if (!toFlipped) {
            positions[_toPartyA][_toPartyB].lockedCollateralA += _amount;
        } else {
            positions[_toPartyA][_toPartyB].lockedCollateralB += _amount;
        }

        // updatePositionState(_fromPartyA, _fromPartyB);
        // updatePositionState(_toPartyA, _toPartyB);
        // emit RebalancePositions
    }

    function rebalanceFromPositionToBook(
        address _mainParty,
        address _counterparty,
        uint256 _amount
    ) public acceptedContract registeredBook(_mainParty) {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(
            _mainParty,
            _counterparty
        );
        (uint256 maxWidthdraw0, uint256 maxWidthdraw1) = _calcMaxCollateralWidthdraw(
            _partyA,
            _partyB
        );
        Book storage book = books[_mainParty];

        if (!flipped) {
            require(maxWidthdraw0 >= _amount, "positionFrom uncovered");
            positions[_partyA][_partyB].lockedCollateralA -= _amount;
        } else {
            require(maxWidthdraw1 >= _amount, "positionFrom uncovered");
            positions[_partyA][_partyB].lockedCollateralB -= _amount;
        }

        book.lockedCollateral = book.lockedCollateral.sub(_amount);
        book.independentAmount = book.independentAmount.add(_amount);
    }

    // TODO: Rebalance from position to book once position coverage more than 150%

    /**
     * @dev Triggers to lock unsettled collateral on a global book for selected currency.
     * @param user User's address
     * @param ccy Specified currency of the deal
     * @param amount Amount of funds to be locked in Ccy for user
     *
     * @notice Callable only by Loan and linked LendingMarket
     */
    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external acceptedContract {
        exposedUnsettledCurrencies[user].add(ccy);
        require(isCoveredUnsettled(user, ccy, amount), "Not enough collateral");

        unsettledCollateral[user][ccy] = unsettledCollateral[user][ccy].add(amount);

        emit UseUnsettledCollateral(user, ccy, amount);
    }

    /**
     * @dev Triggers to lock collateral using ETH rate for selected currency.
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be locked in Ccy for counterparty A
     * @param amount1 Amount of funds to be locked in Ccy for counterparty B
     *
     * @notice Callable only by Loan and linked LendingMarket
     */
    function useCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external acceptedContract {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(partyA, partyB);
        exposedCurrencies[_partyA][_partyB].add(ccy);

        if (!flipped) {
            (uint256 amt0, uint256 amt1) = _calcCollateralForRebalance(
                partyA,
                partyB,
                ccy,
                amount0,
                amount1,
                isSettled
            );

            if (amt0 > 0) {
                rebalanceTo(partyA, partyB, amt0);
            }

            if (amt1 > 0) {
                rebalanceTo(partyB, partyA, amt1);
            }
        } else {
            (uint256 amt0, uint256 amt1) = _calcCollateralForRebalance(
                partyB,
                partyA,
                ccy,
                amount1,
                amount0,
                isSettled
            );

            if (amt0 > 0) {
                rebalanceTo(partyB, partyA, amt0);
            }

            if (amt1 > 0) {
                rebalanceTo(partyA, partyB, amt1);
            }
        }

        CcyNetting storage netting = ccyNettings[_partyA][_partyB][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.add(amount0)
                    : netting.unsettled0PV = netting.unsettled0PV.add(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.add(amount1)
                    : netting.unsettled1PV = netting.unsettled1PV.add(amount1);
            }
        } else {
            if (amount0 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.add(amount0)
                    : netting.unsettled1PV = netting.unsettled1PV.add(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.add(amount1)
                    : netting.unsettled0PV = netting.unsettled0PV.add(amount1);
            }
        }

        // updatePositionState(_partyA, _partyB);
        emit UseCollateral(_partyA, _partyB, ccy, amount0, amount1, isSettled);
    }

    /**
     * @dev Triggers to lock collateral using ETH rate for selected currency.
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be locked in Ccy for counterparty A
     * @param amount1 Amount of funds to be locked in Ccy for counterparty B
     *
     * @notice Callable only by Loan and linked LendingMarket
     */
    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) external acceptedContract {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(partyA, partyB);

        CcyNetting storage netting = ccyNettings[_partyA][_partyB][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                netting.unsettled0PV = netting.unsettled0PV.sub(amount0);
                netting.party0PV = netting.party0PV.add(amount0);
            }
            if (amount1 > 0) {
                netting.unsettled1PV = netting.unsettled1PV.sub(amount1);
                netting.party1PV = netting.party1PV.add(amount1);
            }
        } else {
            if (amount0 > 0) {
                netting.unsettled1PV = netting.unsettled1PV.sub(amount0);
                netting.party1PV = netting.party1PV.add(amount0);
            }
            if (amount1 > 0) {
                netting.unsettled0PV = netting.unsettled0PV.sub(amount1);
                netting.party0PV = netting.party0PV.add(amount1);
            }
        }

        // updatePositionState(_partyA, _partyB);
        emit SettleCollateral(_partyA, _partyB, ccy, amount0, amount1);
    }

    /**
     * @dev Triggers to calculate total unsettled exposure across all currencies
     * @param _user User's address
     */
    function getTotalUnsettledExp(address _user) public view returns (uint256) {
        uint256 totalExpInETH = _netTotalUnsettledAndHypotheticalPV(_user, "", 0);

        return totalExpInETH;
    }

    /**
     * @dev Triggers to calculate netted exposures across all currencies with applied haircuts
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     */
    function getNetAndTotalPV(address party0, address party1)
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        (address _party0, address _party1, ) = _checkAddresses(party0, party1);
        (uint256 net0, uint256 net1, uint256 total0, uint256 total1) = _netTotalAndHypotheticalPV(
            _party0,
            _party1,
            "",
            0,
            0,
            false
        );

        return (net0, net1, total0, total1);
    }

    /**
     * @dev Triggers to check if unsettled collateral exposure covered more that 150% from a global collateral book of `_user`.
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) public view returns (bool) {
        (uint256 coverage, ) = _calculateUnsettledCoverageAndTotalExposure(
            _user,
            _ccy,
            _unsettledExp
        );
        return coverage >= MARGINLEVEL;
    }

    /**
     * @dev Triggers to check if collateral covered more that 150%.
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     * @param _ccy Currency to calculate additional PV for
     * @param _party0PV Counterparty A additional present value
     * @param _party1PV Counterparty B additional present value
     */
    function isCovered(
        address party0,
        address party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) public view returns (bool, bool) {
        (address _party0, address _party1, bool flipped) = _checkAddresses(party0, party1);

        if (!flipped) {
            (uint256 cover0, uint256 cover1) = _calculateCoverage(
                _party0,
                _party1,
                _ccy,
                _party0PV,
                _party1PV,
                _isSettled
            );
            return (cover0 >= MARGINLEVEL, cover1 >= MARGINLEVEL);
        } else {
            (uint256 cover0, uint256 cover1) = _calculateCoverage(
                _party1,
                party0,
                _ccy,
                _party1PV,
                _party0PV,
                _isSettled
            );
            return (cover1 >= MARGINLEVEL, cover0 >= MARGINLEVEL);
        }
    }

    /**
     * @dev Triggers to get maximum amount of ETH available to widthdraw from `_user` collateral book.
     * @param _user User's address
     */
    function getMaxCollateralBookWidthdraw(address _user) public view returns (uint256) {
        (uint256 maxWidthdraw, ) = _calcMaxCollateralWidthdrawFromBook(_user);

        return maxWidthdraw;
    }

    /**
     * @dev Triggers to get maximum amount of ETH available to
     * widthdraw from bilateral position between `party0` and `_party1`.
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     */
    function getMaxCollateralWidthdraw(address _party0, address _party1)
        public
        view
        returns (uint256, uint256)
    {
        (address _partyA, address _partyB, ) = _checkAddresses(_party0, _party1);
        (uint256 maxWidthdraw0, uint256 maxWidthdraw1) = _calcMaxCollateralWidthdraw(
            _partyA,
            _partyB
        );

        return (maxWidthdraw0, maxWidthdraw1);
    }

    /**
     * @dev Triggers to get coverage of the global collateral book against all unsettled exposure.
     * @param _user User's address
     */
    function getUnsettledCoverage(address _user) public view returns (uint256) {
        (uint256 coverage, ) = _calculateUnsettledCoverageAndTotalExposure(_user, "", 0);
        return coverage;
    }

    /**
     * @dev Triggers to get coverage of the global collateral book against all unsettled exposure.
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     */
    function getRebalanceCollateralAmounts(address party0, address party1)
        public
        view
        returns (uint256, uint256)
    {
        (, , bool flipped) = _checkAddresses(party0, party1);

        if (!flipped) {
            (uint256 amt0, uint256 amt1) = _calcCollateralForRebalance(
                party0,
                party1,
                "",
                0,
                0,
                false
            );
            return (amt0, amt1);
        } else {
            (uint256 amt0, uint256 amt1) = _calcCollateralForRebalance(
                party1,
                party0,
                "",
                0,
                0,
                false
            );
            return (amt1, amt0);
        }
    }

    /**
     * @dev Triggers to get bilateral position collateral coverage.
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     */
    function getCoverage(address party0, address party1) public view returns (uint256, uint256) {
        (address _party0, address _party1, bool flipped) = _checkAddresses(party0, party1);

        if (!flipped) {
            (uint256 cover0, uint256 cover1) = _calculateCoverage(
                _party0,
                _party1,
                "",
                0,
                0,
                false
            );
            return (cover0, cover1);
        } else {
            (uint256 cover0, uint256 cover1) = _calculateCoverage(
                _party0,
                _party1,
                "",
                0,
                0,
                false
            );
            return (cover1, cover0);
        }
    }

    /**
     * @dev Triggers to reduce the amount of unsettled exposure in specific `ccy` from a global collateral book of `user`
     * @param user User's ETH address
     * @param ccy Specified currency of the deal
     * @param amount Amount of funds to be unlocked from unsettled exposure in specified ccy
     *
     * @notice Callable only by smart contracts allowed to use collateral
     */
    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external acceptedContract {
        unsettledCollateral[user][ccy] = unsettledCollateral[user][ccy].sub(amount);

        if (unsettledCollateral[user][ccy] == 0) {
            exposedUnsettledCurrencies[user].remove(ccy);
        }

        emit ReleaseUnsettled(user, ccy, amount);
    }

    /**
     * @dev Triggers to reduce PV for specific `ccy` in bilateral position between `partyA` and `partyB`
     * @param partyA Counterparty A address
     * @param partyB Counterparty B address
     * @param ccy Specified currency of the deal
     * @param amount0 Amount of funds to be removed in CcyNetting for counterparty A
     * @param amount1 Amount of funds to be removed in CcyNetting for counterparty B
     *
     * @notice Callable only by smart contracts allowed to use collateral
     */
    function releaseCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external acceptedContract {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(partyA, partyB);
        require(exposedCurrencies[_partyA][_partyB].contains(ccy), "non-used ccy");
        CcyNetting storage netting = ccyNettings[_partyA][_partyB][ccy];

        if (!flipped) {
            if (amount0 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.sub(amount0)
                    : netting.unsettled0PV = netting.unsettled0PV.sub(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.sub(amount1)
                    : netting.unsettled1PV = netting.unsettled1PV.sub(amount1);
            }
        } else {
            if (amount0 > 0) {
                isSettled
                    ? netting.party1PV = netting.party1PV.sub(amount0)
                    : netting.unsettled1PV = netting.unsettled1PV.sub(amount0);
            }
            if (amount1 > 0) {
                isSettled
                    ? netting.party0PV = netting.party0PV.sub(amount1)
                    : netting.unsettled0PV = netting.unsettled0PV.sub(amount1);
            }
        }

        // updatePositionState(_partyA, _partyB);
        emit Release(_partyA, _partyB, ccy, amount0, amount1);
    }

    /**
     * @dev Triggers to withdraw collateral from independent collateral amount in user's book
     * @param _amt Amount of collateral to withdraw
     *
     * @notice If requested more that independent amount withdraw all available collateral not used
     */
    function withdraw(uint256 _amt) public registeredBook(msg.sender) {
        Book storage book = books[msg.sender];
        (uint256 maxWidthdraw, ) = _calcMaxCollateralWidthdrawFromBook(msg.sender);

        // if (totalUnsettledExp == 0) {
        //     maxWidthdraw = book.independentAmount;
        // }

        if (_amt > maxWidthdraw) {
            book.independentAmount = book.independentAmount.sub(maxWidthdraw);
            payable(msg.sender).transfer(maxWidthdraw);
            emit Withdraw(msg.sender, maxWidthdraw);
        } else {
            book.independentAmount = book.independentAmount.sub(_amt);
            payable(msg.sender).transfer(_amt);
            emit Withdraw(msg.sender, _amt);
        }
    }

    /**
     * @dev Triggers to withdraw collateral from bilateral position between `msg.sender` and `_counterparty`
     * @param _counterparty Counterparty address in bilateral position
     * @param _amt Amount of collateral to withdraw
     *
     * @notice If requested more that independent amount withdraw all available collateral not used
     */
    function withdrawFrom(address _counterparty, uint256 _amt) public registeredBook(msg.sender) {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(
            msg.sender,
            _counterparty
        );
        (uint256 maxWidthdraw0, uint256 maxWidthdraw1) = _calcMaxCollateralWidthdraw(
            _partyA,
            _partyB
        );

        Position storage position = positions[_partyA][_partyB];
        uint256 withdrawAmt;

        if (!flipped) {
            withdrawAmt = maxWidthdraw0 > _amt ? _amt : maxWidthdraw0;
            position.lockedCollateralA -= withdrawAmt;
            emit PositionWithdraw(_partyA, _partyB, withdrawAmt, 0);
        } else {
            withdrawAmt = maxWidthdraw1 > _amt ? _amt : maxWidthdraw1;
            position.lockedCollateralB -= withdrawAmt;
            emit PositionWithdraw(_partyA, _partyB, 0, withdrawAmt);
        }

        books[msg.sender].lockedCollateral -= withdrawAmt; // save deposited collateral in global book
        payable(msg.sender).transfer(withdrawAmt);
    }

    /**
     * @dev Triggers to update PV value in currency for bilateral position
     * changes present value in native currency, without exchange rate conversion
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     * @param ccy Specified currency of the deal
     * @param prevPV0 Previous present value to be substracted from total exposure for counterparty A
     * @param prevPV1 Previous present value to be substracted from total exposure for counterparty B
     * @param currentPV0 Current present value to be added to total exposure for counterparty A
     * @param currentPV1 Current present value to be added to total exposure for counterparty B
     *
     * @notice Trigers only be Loan contract
     */
    function updatePV(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) external acceptedContract {
        (address _party0, address _party1, bool flipped) = _checkAddresses(party0, party1);

        CcyNetting storage netting = ccyNettings[_party0][_party1][ccy];

        if (!flipped) {
            if (currentPV0 > 0) {
                netting.party0PV = netting.party0PV.sub(prevPV0).add(currentPV0);
            }
            if (currentPV1 > 0) {
                netting.party1PV = netting.party1PV.sub(prevPV1).add(currentPV1);
            }
        } else {
            if (currentPV0 > 0) {
                netting.party1PV = netting.party1PV.sub(prevPV0).add(currentPV0);
            }
            if (currentPV1 > 0) {
                netting.party0PV = netting.party0PV.sub(prevPV1).add(currentPV1);
            }
        }
        // updatePositionState(_party0, _party1);

        // emit UpdatePV(_party0, _party1, ccy, prevPV0, prevPV1, currentPV0, currentPV1);
    }

    /**
     * @dev Triggers to liquidate unsettled collateral from borrower's global collateral book to lender's collateral book
     * @param from Address for liquidating collateral from
     * @param to Address for sending collateral to
     * @param ccy Currency to use rate to ETH for
     * @param amount Liquidation amount in Ccy
     *
     * @notice Trigers only be Loan contract
     */
    function liquidateUnsettled(
        address from,
        address to,
        bytes32 ccy,
        uint256 amount
    ) external {
        require(collateralUsers.contains(msg.sender), "incorrect liquidator");
        uint256 amt = currencyController.convertToETH(ccy, amount);

        unsettledCollateral[from][ccy].sub(amount);

        books[from].independentAmount -= amt; // save deposited collateral in global book
        books[to].independentAmount += amt; // save deposited collateral in global book

        emit LiquidateUnsettled(from, to, ccy, amount, amt);
    }

    /**
     * @dev Triggers to liquidate collateral from borrower to lender
     * @param from Address for liquidating collateral from
     * @param to Address for sending collateral to
     * @param ccy Currency to use rate to ETH for
     * @param amount Liquidation amount in Ccy
     *
     * @notice Trigers only be Loan contract
     */
    function liquidate(
        address from,
        address to,
        bytes32 ccy,
        uint256 amount
    ) external {
        require(collateralUsers.contains(msg.sender), "incorrect liquidator");
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(from, to);
        uint256 amt = currencyController.convertToETH(ccy, amount);
        // TODO: rebalance required amount of collateral, transfer excess into global book
        Position storage position = positions[_partyA][_partyB];

        if (!flipped) {
            require(position.lockedCollateralA >= amt, "Liquidation amount not enough");
            position.lockedCollateralA -= amt;
            position.lockedCollateralB += amt;
        } else {
            require(position.lockedCollateralB >= amt, "Liquidation amount not enough");
            position.lockedCollateralB -= amt;
            position.lockedCollateralA += amt;
        }

        books[from].lockedCollateral -= amt; // save deposited collateral in global book
        books[to].lockedCollateral += amt; // save deposited collateral in global book

        emit Liquidate(from, to, amt);
    }

    function getCollateralBook(address addr) public view returns (Book memory) {
        return books[addr];
    }

    function checkRegisteredBook(address addr) public view returns (bool) {
        return isRegistered[addr];
    }

    struct BilateralPositionLocalVars {
        address partyA;
        address partyB;
        uint256 lockedCollateralA;
        uint256 lockedCollateralB;
        uint256 maxCcy;
        bytes32[] currencies;
        uint256[] unsettled0PVs;
        uint256[] unsettled1PVs;
        uint256[] party0PVs;
        uint256[] party1PVs;
        uint256[] netPayments;
    }

    function getBilateralPosition(address partyA, address partyB)
        public
        view
        returns (Position memory)
    {
        (address _partyA, address _partyB, ) = _checkAddresses(partyA, partyB);
        Position memory position = positions[_partyA][_partyB];

        return position;
    }

    function getCcyExposures(
        address partyA,
        address partyB,
        bytes32 ccy
    ) public view returns (CcyNetting memory) {
        (address _partyA, address _partyB, ) = _checkAddresses(partyA, partyB);

        require(exposedCurrencies[_partyA][_partyB].contains(ccy), "non-used ccy");

        CcyNetting memory netting = ccyNettings[_partyA][_partyB][ccy];

        return netting;
    }

    function getExposedCurrencies(address partyA, address partyB)
        public
        view
        returns (bytes32[] memory)
    {
        (address _partyA, address _partyB, ) = _checkAddresses(partyA, partyB);
        EnumerableSet.Bytes32Set storage expCcy = exposedCurrencies[_partyA][_partyB];

        uint256 numCcy = expCcy.length();
        bytes32[] memory currencies = new bytes32[](numCcy);

        for (uint256 i = 0; i < numCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            currencies[i] = ccy;
        }

        return currencies;
    }

    // =========== INTERNAL FUNCTIONS ===========

    /**
     * @dev Triggers internaly to store new collateral book
     * @param id Gateway token ID for KYC'd addresses
     */
    function _register(uint256 id) internal {
        Book memory book;

        if (id != 0) {
            book.gatewayTokenId = id;
        }

        if (msg.value > 0) {
            book.independentAmount = msg.value;
        }

        isRegistered[msg.sender] = true;
        books[msg.sender] = book;

        emit Register(msg.sender, id, msg.value);
    }

    /**
     * @dev Triggers internally to check if counterparty addresses are correct, modifies the order if needed.
     * @param party0 Counterparty A address
     * @param party1 Counterparty B address
     */
    function _checkAddresses(address party0, address party1)
        internal
        pure
        returns (
            address,
            address,
            bool
        )
    {
        require(party0 != party1, "Identical addresses");
        (address _party0, address _party1) = party0 < party1 ? (party0, party1) : (party1, party0);
        require(_party0 != address(0), "Invalid address");
        require(_party1 != address(0), "Invalid counterparty");

        if (_party0 != party0) {
            return (_party0, _party1, true);
        } else {
            return (_party0, _party1, false);
        }
    }

    /**
     * @dev Rebalance collateral from `_mainParty` collateral book to specific bilateral position
     */
    function _rebalanceFromBook(
        address _mainParty,
        address _counterparty,
        uint256 _amount
    ) internal {
        (address _partyA, address _partyB, bool flipped) = _checkAddresses(
            _mainParty,
            _counterparty
        );
        Book storage book = books[_mainParty];

        (uint256 maxWidthdraw, ) = _calcMaxCollateralWidthdrawFromBook(_mainParty);
        require(maxWidthdraw >= _amount, "Invalid rebalance amount");

        book.independentAmount = book.independentAmount.sub(_amount); // includes overflow checks
        book.lockedCollateral = book.lockedCollateral.add(_amount);

        if (!flipped) {
            positions[_partyA][_partyB].lockedCollateralA += _amount;
            emit Rebalance(_partyA, _partyB, _amount, 0);
        } else {
            positions[_partyA][_partyB].lockedCollateralB += _amount;
            emit Rebalance(_partyA, _partyB, 0, _amount);
        }
    }

    struct NetAndTotalPVLocalVars {
        uint256 exp0;
        uint256 exp1;
        uint256 unsettledExp0;
        uint256 unsettledExp1;
        int256 exchangeRate;
        uint256 totalUnsettledPV0inETH;
        uint256 totalUnsettledPV1inETH;
        uint256 totalPV0inETH;
        uint256 totalPV1inETH;
        uint256 totalCombinedPV0inETH;
        uint256 totalCombinedPV1inETH;
        uint256 totalHaircutPV0;
        uint256 totalHaircutPV1;
        uint256 haircutRatio;
        uint256 expDiff0;
        uint256 expDiff1;
        uint256 netExp0;
        uint256 netExp1;
        CcyNetting netting;
        uint256 maxCcy;
    }

    /**
     * @dev Triggers to calculate netted exposures across all currencies with applied haircuts.
     * Also used to calculate hypothetical Net PV with additional exposure in specific `_ccy`
     * @param _party0 Counterparty A address
     * @param _party1 Counterparty B address
     * @param _ccy Currency to calculate additional PV for
     * @param _party0PV Counterparty A additional present value
     * @param _party1PV Counterparty B additional present value
     */
    function _netTotalAndHypotheticalPV(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool isSettled
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        EnumerableSet.Bytes32Set storage expCcy = exposedCurrencies[_party0][_party1];
        NetAndTotalPVLocalVars memory vars;

        vars.maxCcy = expCcy.length();

        for (uint256 i = 0; i < vars.maxCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            vars.netting = ccyNettings[_party0][_party1][ccy];
            vars.exchangeRate = currencyController.getLastETHPrice(ccy);

            if (_ccy == ccy) {
                if (isSettled) {
                    vars.exp0 = (vars.netting.party0PV.add(_party0PV))
                        .mul(uint256(vars.exchangeRate))
                        .div(1e18);
                    vars.exp1 = (vars.netting.party1PV.add(_party1PV))
                        .mul(uint256(vars.exchangeRate))
                        .div(1e18);
                } else {
                    vars.unsettledExp0 = vars
                        .netting
                        .unsettled0PV
                        .add(_party0PV)
                        .mul(uint256(vars.exchangeRate))
                        .div(1e18);
                    vars.unsettledExp1 = vars
                        .netting
                        .unsettled1PV
                        .add(_party1PV)
                        .mul(uint256(vars.exchangeRate))
                        .div(1e18);
                }
            } else {
                vars.unsettledExp0 = vars.netting.unsettled0PV.mul(uint256(vars.exchangeRate)).div(
                    1e18
                );
                vars.unsettledExp1 = vars.netting.unsettled1PV.mul(uint256(vars.exchangeRate)).div(
                    1e18
                );

                vars.exp0 = vars.netting.party0PV.mul(uint256(vars.exchangeRate)).div(1e18);
                vars.exp1 = vars.netting.party1PV.mul(uint256(vars.exchangeRate)).div(1e18);
            }

            vars.totalUnsettledPV0inETH = vars.totalUnsettledPV0inETH.add(vars.unsettledExp0);
            vars.totalUnsettledPV1inETH = vars.totalUnsettledPV1inETH.add(vars.unsettledExp1);

            vars.haircutRatio = currencyController.getHaircut(ccy);

            vars.totalPV0inETH = vars.totalPV0inETH.add(vars.exp0);
            vars.totalPV1inETH = vars.totalPV1inETH.add(vars.exp1);

            vars.totalHaircutPV0 = vars.totalHaircutPV0.add(
                vars.exp0.mul(vars.haircutRatio).div(BP)
            );
            vars.totalHaircutPV1 = vars.totalHaircutPV1.add(
                vars.exp1.mul(vars.haircutRatio).div(BP)
            );
        }

        vars.expDiff0 = vars.totalPV0inETH >= vars.totalHaircutPV1
            ? vars.totalPV0inETH.sub(vars.totalHaircutPV1)
            : 0;
        vars.expDiff1 = vars.totalPV1inETH >= vars.totalHaircutPV0
            ? vars.totalPV1inETH.sub(vars.totalHaircutPV0)
            : 0;

        (vars.netExp0, vars.netExp1) = vars.expDiff0 > vars.expDiff1
            ? (
                vars.expDiff0.sub(vars.expDiff1).add(vars.totalUnsettledPV0inETH),
                vars.totalUnsettledPV1inETH
            )
            : (
                vars.totalUnsettledPV0inETH,
                vars.expDiff1.sub(vars.expDiff0).add(vars.totalUnsettledPV1inETH)
            );

        vars.totalCombinedPV0inETH = vars.totalUnsettledPV0inETH.add(vars.totalPV0inETH);
        vars.totalCombinedPV1inETH = vars.totalUnsettledPV1inETH.add(vars.totalPV1inETH);

        return (vars.netExp0, vars.netExp1, vars.totalCombinedPV0inETH, vars.totalCombinedPV1inETH);
    }

    struct CollateralReqLocalVars {
        uint256 net0;
        uint256 net1;
        uint256 total0;
        uint256 total1;
        uint256 minMarginRatio;
        uint256 minMarginReq0;
        uint256 minMarginReq1;
        uint256 netCover0;
        uint256 netCover1;
        uint256 req0;
        uint256 req1;
    }

    /**
     * @dev Triggers to calculate collateral coverage for bilateral position with/without additional PV
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `cover0`, `cover1` uint256 coverage percentages in basis point per counterparty
     */
    // TODO: NOW
    function _calculateCollateralRequirements(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) internal view returns (uint256, uint256) {
        CollateralReqLocalVars memory vars;

        (vars.net0, vars.net1, vars.total0, vars.total1) = _netTotalAndHypotheticalPV(
            _party0,
            _party1,
            _ccy,
            _party0PV,
            _party1PV,
            _isSettled
        );

        vars.minMarginRatio = currencyController.getMinMargin("ETH");
        vars.minMarginReq0 = vars.total0.mul(vars.minMarginRatio).div(BP);
        vars.minMarginReq1 = vars.total1.mul(vars.minMarginRatio).div(BP);

        if (vars.net0 > 0) {
            vars.netCover0 = (vars.net0.mul(MARGINLEVEL)).div(BP);
            vars.req0 = vars.minMarginReq0 > vars.netCover0 ? vars.minMarginReq0 : vars.net0;
        } else {
            vars.req0 = vars.minMarginReq0;
        }

        if (vars.net1 > 0) {
            vars.netCover1 = (vars.net1.mul(MARGINLEVEL)).div(BP);
            vars.req1 = vars.minMarginReq1 > vars.netCover1 ? vars.minMarginReq1 : vars.net1;
        } else {
            vars.req1 = vars.minMarginReq1;
        }

        return (vars.req0, vars.req1);
    }

    struct CoverageCalcLocalVars {
        uint256 req0;
        uint256 req1;
        uint256 cover0;
        uint256 cover1;
    }

    /**
     * @dev Triggers to calculate collateral coverage for bilateral position with/without additional PV
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `cover0`, `cover1` uint256 coverage percentages in basis point per counterparty
     */
    // TODO: NOW
    function _calculateCoverage(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) internal view returns (uint256, uint256) {
        CoverageCalcLocalVars memory vars;

        (vars.req0, vars.req1) = _calculateCollateralRequirements(
            _party0,
            _party1,
            _ccy,
            _party0PV,
            _party1PV,
            _isSettled
        );

        Position memory position = positions[_party0][_party1];

        if (vars.req0 > 0) {
            vars.cover0 = (PCT.mul(position.lockedCollateralA)).div(vars.req0);
        }

        if (vars.req1 > 0) {
            vars.cover1 = (PCT.mul(position.lockedCollateralB)).div(vars.req1);
        }

        return (vars.cover0, vars.cover1);
    }

    struct MaxCollateralWidthdrawLocalVars {
        uint256 req0;
        uint256 req1;
        uint256 targetReq0;
        uint256 targetReq1;
        uint256 delta0;
        uint256 delta1;
        uint256 maxWidthdraw0;
        uint256 maxWidthdraw1;
    }

    /**
     * @dev Triggers to calculate max collateral amount available to widthdraw from bilateral position
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `maxWidthdraw0`, `maxWidthdraw1` uint256 available for widthdraw collateral amounts
     */
    // TODO: NOW
    function _calcMaxCollateralWidthdraw(address _party0, address _party1)
        internal
        view
        returns (uint256, uint256)
    {
        MaxCollateralWidthdrawLocalVars memory vars;

        (vars.req0, vars.req1) = _calculateCollateralRequirements(
            _party0,
            _party1,
            "",
            0,
            0,
            false
        );

        vars.targetReq0 = vars.req0.mul(MARGINLEVEL).div(BP);
        vars.targetReq1 = vars.req1.mul(MARGINLEVEL).div(BP);

        Position memory position = positions[_party0][_party1];

        if (position.lockedCollateralA > 0 && vars.targetReq0 > 0) {
            vars.maxWidthdraw0 = position.lockedCollateralA > vars.targetReq0
                ? position.lockedCollateralA.sub(vars.targetReq0)
                : 0;
        } else {
            vars.maxWidthdraw0 = position.lockedCollateralA;
        }

        if (position.lockedCollateralB > 0 && vars.targetReq1 > 0) {
            vars.maxWidthdraw1 = position.lockedCollateralB > vars.targetReq1
                ? position.lockedCollateralB.sub(vars.targetReq1)
                : 0;
        } else {
            vars.maxWidthdraw1 = position.lockedCollateralB;
        }

        return (vars.maxWidthdraw0, vars.maxWidthdraw1);
    }

    struct RequiredCollateralForRebalanceLocalVars {
        uint256 req0;
        uint256 req1;
        uint256 targetReq0;
        uint256 targetReq1;
        uint256 cover0;
        uint256 cover1;
        uint256 targetLocked0;
        uint256 targetLocked1;
        uint256 reqCollateral0;
        uint256 reqCollateral1;
    }

    /**
     * @dev Triggers to calculate collateral amount in ETH to rebalance to keep collateral coverage at least on MARGINLEVEL
     * @param _party0 Counterparty A address
     * @param _party0 Counterparty B address
     *
     * @return `amt0`, `amt1` uint256 amount of ETH to be rebalanced from parties collateral books
     */
    function _calcCollateralForRebalance(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _amount0,
        uint256 _amount1,
        bool _isSettled
    ) internal view returns (uint256, uint256) {
        RequiredCollateralForRebalanceLocalVars memory vars;

        (vars.req0, vars.req1) = _calculateCollateralRequirements(
            _party0,
            _party1,
            _ccy,
            _amount0,
            _amount1,
            _isSettled
        );

        vars.targetReq0 = vars.req0.mul(MARGINLEVEL).div(BP);
        vars.targetReq1 = vars.req1.mul(MARGINLEVEL).div(BP);

        Position memory position = positions[_party0][_party1];

        if (position.lockedCollateralA > 0 && vars.targetReq0 > 0) {
            vars.reqCollateral0 = position.lockedCollateralA > vars.targetReq0
                ? 0
                : vars.targetReq0.sub(position.lockedCollateralA);
        } else {
            vars.reqCollateral0 = vars.targetReq0;
        }

        if (position.lockedCollateralB > 0 && vars.targetReq1 > 0) {
            vars.reqCollateral1 = position.lockedCollateralB > vars.targetReq1
                ? 0
                : vars.targetReq1.sub(position.lockedCollateralB);
        } else {
            vars.reqCollateral1 = vars.targetReq1;
        }

        return (vars.reqCollateral0, vars.reqCollateral1);
    }

    struct NetUnsettledExpLocalVars {
        uint256 totalExp;
        uint256 ccyExp;
        uint256 ccyExpInETH;
        int256 exchangeRate;
        uint256 maxCcy;
    }

    /**
     * @dev Triggers to calculate total unsettled exposure across all currencies for a global collateral book.
     * Also used to calculate hypothetical Net PV with additional exposure in specific `_ccy`
     * @param _user User's ethereum address
     * @param _ccy Currency to calculate additional PV for
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     */
    function _netTotalUnsettledAndHypotheticalPV(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256) {
        EnumerableSet.Bytes32Set storage expCcy = exposedUnsettledCurrencies[_user];

        NetUnsettledExpLocalVars memory vars;

        vars.maxCcy = expCcy.length();

        for (uint256 i = 0; i < vars.maxCcy; i++) {
            bytes32 ccy = expCcy.at(i);
            vars.ccyExp = unsettledCollateral[_user][ccy];
            vars.exchangeRate = currencyController.getLastETHPrice(ccy);

            if (_ccy == ccy) {
                vars.ccyExpInETH = (vars.ccyExp.add(_unsettledExp))
                    .mul(uint256(vars.exchangeRate))
                    .div(1e18);
            } else {
                vars.ccyExpInETH = vars.ccyExp.mul(uint256(vars.exchangeRate)).div(1e18);
            }

            vars.totalExp = vars.totalExp.add(vars.ccyExpInETH);
        }

        return vars.totalExp;
    }

    struct UnsettledCoverageLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
    }

    function _calculateUnsettledCoverageAndTotalExposure(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256, uint256) {
        UnsettledCoverageLocalVars memory vars;

        vars.totalExpInETH = _netTotalUnsettledAndHypotheticalPV(_user, _ccy, _unsettledExp);

        Book memory book = books[_user];

        if (vars.totalExpInETH > 0) {
            vars.coverage = (PCT.mul(book.independentAmount)).div(vars.totalExpInETH);
        } else {
            return (0, vars.totalExpInETH);
        }

        return (vars.coverage, vars.totalExpInETH);
    }

    struct MaxCollateralBookWidthdrawLocalVars {
        uint256 totalExpInETH;
        uint256 coverage;
        uint256 delta;
        uint256 maxWidthdraw;
    }

    /**
     * @dev Triggers to calculate maximum amount of ETH available to widthdraw from `_user` collateral book
     * @param _user User's ethereum address
     *
     * @return `maxWidthdraw` max widthdrawable amount of ETH
     */
    function _calcMaxCollateralWidthdrawFromBook(address _user)
        internal
        view
        returns (uint256, uint256)
    {
        MaxCollateralBookWidthdrawLocalVars memory vars;

        (vars.coverage, vars.totalExpInETH) = _calculateUnsettledCoverageAndTotalExposure(
            _user,
            "",
            0
        );

        Book memory book = books[_user];

        if (vars.coverage > MARGINLEVEL) {
            vars.delta = vars.coverage.sub(MARGINLEVEL);

            vars.maxWidthdraw = book.independentAmount.mul(vars.delta).div(vars.coverage);
        } else if (vars.totalExpInETH == 0) {
            return (book.independentAmount, vars.totalExpInETH);
        } else {
            return (0, vars.totalExpInETH);
        }

        return (vars.maxWidthdraw, vars.totalExpInETH);
    }
}
