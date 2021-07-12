// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/IFXRatesAggregator.sol";
import "./ProtocolTypes.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title Collateral contract is using for storing Secured Finance  
 * protocol users collateral in ETH. This contract also handle the 
 * coverage calculation against all present values and liquidations 
 * using FX rates for all protocol currency pairs to ETH
 *
 * Contract linked to Loan, LendingMarket, FXRatesAggregator contracts.
 */
contract Collateral is ProtocolTypes {
    using SafeMath for uint256;

    event Register(address indexed addr, string id, string userAddrFIL, string userAddrBTC, uint256 amount);
    event Deposit(address indexed addr, uint256 amount);
    event Withdraw(address indexed addr, uint256 amount);
    event Release(address indexed addr, uint256 amount, Ccy ccy);
    event UseCollateral(address indexed addr, uint256 amount, Ccy ccy);
    event UpdateFILAddress(address indexed addr, string filAddr);
    event UpdateBTCAddress(address indexed addr, string btcAddr);
    event Liquidate(address indexed from, address indexed to, uint256 amount);
    event UpdateState(address indexed addr, CollateralState prevState, CollateralState currState);
    event UpdatePV(address indexed addr, uint256 prevPV, uint256 newPV, Ccy ccy);

    struct ColBook {
        string id; // DID, email
        bytes userAddrFIL;
        bytes userAddrBTC;
        uint256 colAmtETH; // total collateral amount
        uint256 totalUsedETH; // total PV of ETH loans
        uint256 totalUsedFIL; // total PV of FIL loans
        uint256 totalUsedUSDC; // total PV of USDC loans
        uint256 totalUsedBTC; // total PV of BTC loans
        bool isAvailable;
        CollateralState state;
    }

    /**
    * @dev Collateral mapping for all collateral books.
    */
    mapping(address => ColBook) private colMap;
    address[] private users;
    address public owner;

    // Collateral coverage ratios
    uint256 public LQLEVEL;
    uint256 public MARGINLEVEL;
    uint256 public AUTOLQLEVEL;

    // Contracts
    address loan;
    IFXRatesAggregator ratesAggregator;
    mapping(Ccy => mapping(Term => address)) public lendingMarkets;

    /**
    * @dev Modifier to make a function callable only by contract owner.
    */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
    * @dev Modifier to check if LendingMarket contract linked with this contract
    * @param _ccy LendingMarket currency
    * @param _term LendingMarket term
    */
    modifier lendingMarketExists(Ccy _ccy, Term _term) {
        require(lendingMarkets[_ccy][_term] == msg.sender);
        _;
    }

    /**
    * @dev Modifier to make a function callable only by Loan and linked LendingMarket
    * @param _ccy LendingMarket currency
    */
    modifier acceptedAddr(Ccy _ccy) {
        require(
            msg.sender == address(loan) ||
            isLendingMarket(_ccy, msg.sender),
            "msg sender is not allowed to use collateral"
        );
        _;
    }

    /**
    * @dev Contract constructor function.
    * @param loanAddr Loan contract address
    *
    * @notice sets contract deployer as owner of this contract
    */
    constructor(address loanAddr) public {
        owner = msg.sender;
        loan = loanAddr;

        LQLEVEL = 12000; // 120% for liquidation price
        MARGINLEVEL = 15000; // 150% margin call threshold
        AUTOLQLEVEL = 12500; // 125% auto liquidatio
    }

    /**
    * @dev Trigers to link with LendingMarket contract
    * @param _ccy LendingMarket currency
    * @param _term LendingMarket term
    * @param _addr LendingMarket contract address
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving 0x0 address
    */
    function addLendingMarket(Ccy _ccy, Term _term, address _addr) public onlyOwner {
        require(lendingMarkets[_ccy][_term] == address(0), "Couldn't rewrite existing market");
        lendingMarkets[_ccy][_term] = _addr;
    }

    /**
    * @dev Trigers to check if msg.sender is a LendingMarket contract
    * @param _ccy LendingMarket currency
    * @param _addr LendingMarket contract address
    */
    function isLendingMarket(Ccy _ccy, address _addr) public view returns (bool) {
        for (uint256 i = 0; i < NUMTERM; i++) {
            if (lendingMarkets[_ccy][Term(i)] == _addr) {
                return true;
            }
        }
        return false;
    }

    /**
    * @dev Trigers to link with loan contract
    * @param addr Loan contract address
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving the same address
    */
    function setLoanAddr(address addr) public onlyOwner {
        require(loan != addr, "Couldn't rewrite the same address");
        loan = addr;
    }

    /**
    * @dev Trigers to link with FXRatesAggregator contract
    * @param addr FXRatesAggregator contract address
    *
    * @notice Trigers only be contract owner
    */
    function setRatesAggregatorAddr(address addr) public onlyOwner {
        require(addr != address(0));
        ratesAggregator = IFXRatesAggregator(addr);
    }

    /**
    * @dev Register user and make collateral book
    * @param id User ID (typically is an identity string)
    * @param userAddrFIL User Filecoin address
    * @param userAddrBTC User Bitcoin address
    *
    * @notice Payable function, if user sends ETH msg.value adds to colAmtETH
    */
    function register(
        string memory id,
        string memory userAddrFIL,
        string memory userAddrBTC
    ) public payable {
        require(!colMap[msg.sender].isAvailable, "User registered already");
        ColBook memory book;
        book.id = id;
        book.colAmtETH = msg.value;
        book.userAddrFIL = abi.encodePacked(userAddrFIL);
        book.userAddrBTC = abi.encodePacked(userAddrBTC);
        book.state = msg.value > 0 ? CollateralState.AVAILABLE : CollateralState.EMPTY;
        book.isAvailable = true;
        colMap[msg.sender] = book;

        users.push(msg.sender);
        emit Register(msg.sender, id, userAddrFIL, userAddrBTC, msg.value);
    }

    /**
    * @dev Update FIL address for msg.sender collateral book
    * @param addr Filecoin network address
    */
    function updateFILAddr(string memory addr) public {
        require(colMap[msg.sender].isAvailable, "collateral book not registered");
        colMap[msg.sender].userAddrFIL = abi.encodePacked(addr);
        updateState(msg.sender);
        emit UpdateFILAddress(msg.sender, addr);
    }

    /**
    * @dev Update BTC address for msg.sender collateral book
    * @param addr Bitcoin network address
    */
    function updateBTCAddr(string memory addr) public {
        require(colMap[msg.sender].isAvailable, "collateral book not registered");
        colMap[msg.sender].userAddrBTC = abi.encodePacked(addr);
        updateState(msg.sender);
        emit UpdateBTCAddress(msg.sender, addr);
    }

    /**
    * @dev Deposit ETH collateral for msg.sender in collateral book
    * @notice payable function increases the collateral amount by msg.value
    */
    function deposit() public payable {
        require(colMap[msg.sender].isAvailable, "user not found");
        colMap[msg.sender].colAmtETH += msg.value;
        updateState(msg.sender);
        require(colMap[msg.sender].state == CollateralState.AVAILABLE || colMap[msg.sender].state == CollateralState.IN_USE, "Collateral not covering 150%");
        emit Deposit(msg.sender, msg.value);
    }

    /**
    * @dev Triggers to lock collateral using ETH rate for selected currency.
    * @param ccy Currency to use ETH rate for
    * @param amt Amount of funds to be locked in Ccy
    * @param addr User address
    *
    * @notice Callable only by Loan and linked LendingMarket
    */
    function useCollateral(
        Ccy ccy,
        uint256 amt,
        address addr
    ) external acceptedAddr(ccy) {
        require(isCovered(amt, ccy, addr), "Please upsize collateral");
        ColBook storage book = colMap[addr];
        if (ccy == Ccy.ETH) {
            book.totalUsedETH = book.totalUsedETH.add(amt);
        } else {            
            if (ccy == Ccy.FIL) {
                book.totalUsedFIL = book.totalUsedFIL.add(amt);
            } else if (ccy == Ccy.USDC) {
                book.totalUsedUSDC = book.totalUsedUSDC.add(amt);
            } else if (ccy == Ccy.BTC) {
                book.totalUsedBTC = book.totalUsedBTC.add(amt);
            }
        }
        updateState(addr);
        emit UseCollateral(addr, amt, ccy);
    }

    /**
    * @dev Triggers to check if collateral covered more that 150%.
    * @param amt Amount of funds to check in Ccy
    * @param ccy Currency to use ETH rate for
    * @param addr User address
    */
    function isCovered(
        uint256 amt,
        Ccy ccy,
        address addr
    ) public view returns (bool) {
        require(colMap[addr].isAvailable, "Collateral book not set yet");
        if (amt == 0) return true;
        ColBook memory book = colMap[addr];
        uint256 toBeUsed = ratesAggregator.convertToETH(uint8(ccy), amt);
        require(book.colAmtETH >= toBeUsed, "Not enough collateral");

        uint256 totalUse = calculatePVinETH(addr);
        if (totalUse == 0) {
            uint256 coverage = (PCT.mul(book.colAmtETH)).div(toBeUsed);
            return coverage >= MARGINLEVEL;
        } else {
            uint256 coverage = (PCT.mul(book.colAmtETH)).div(totalUse.add(toBeUsed));
            return coverage >= MARGINLEVEL;
        }
    }

    /**
    * @dev Triggers to get all present values in ETH
    * @param addr User address
    */
    function calculatePVinETH(address addr) 
        public
        view
        returns (uint256)
    {
        require(colMap[addr].isAvailable, "Collateral book not set yet");
        ColBook memory book = colMap[addr];
        uint256 totalPVinETH;

        if (book.totalUsedFIL > 0) {
            uint256 used = ratesAggregator.convertToETH(uint8(Ccy.FIL), book.totalUsedFIL);
            totalPVinETH = totalPVinETH.add(used);
        }
        if (book.totalUsedBTC > 0) {
            uint256 used = ratesAggregator.convertToETH(uint8(Ccy.BTC), book.totalUsedBTC);
            totalPVinETH = totalPVinETH.add(used);
        }
        if (book.totalUsedUSDC > 0) {
            uint256 used = ratesAggregator.convertToETH(uint8(Ccy.USDC), book.totalUsedUSDC);
            totalPVinETH = totalPVinETH.add(used);
        }

        uint256 totalUse = book.totalUsedETH.add(totalPVinETH);
        return totalUse;
    }

    /**
    * @dev Triggers to get current collateral coverage
    * @param addr User address
    */
    function getCoverage(address addr)
        public
        view
        returns (uint256)
    {
        require(colMap[addr].isAvailable, "not registered yet");
        ColBook memory book = colMap[addr];

        uint256 totalUse = calculatePVinETH(addr);
        uint256 coverage = (PCT.mul(book.colAmtETH)).div(totalUse);
        return coverage;
    }

    /**
    * @dev Triggers to unlock collateral for specific user
    * @param ccy Currency to use rate to ETH for
    * @param amt Amount of collateral to unlock
    * @param addr User address
    *
    * @notice Callable only by Loan and linked LendingMarket
    */
    function releaseCollateral(
        Ccy ccy,
        uint256 amt,
        address addr
    ) external acceptedAddr(ccy) {
        ColBook storage book = colMap[addr];
        if (ccy == Ccy.ETH) {
            require(book.totalUsedETH >= amt);
            book.totalUsedETH = book.totalUsedETH.sub(amt);
        } else {
            if (ccy == Ccy.FIL) {
                require(book.totalUsedFIL >= amt, "Not enough to unlock");
                book.totalUsedFIL = book.totalUsedFIL.sub(amt);
            } else if (ccy == Ccy.USDC) {
                require(book.totalUsedUSDC >= amt, "Not enough to unlock");
                book.totalUsedUSDC = book.totalUsedUSDC.sub(amt);
            } else if (ccy == Ccy.BTC) {
                require(book.totalUsedBTC >= amt, "Not enough to unlock");
                book.totalUsedBTC = book.totalUsedBTC.sub(amt);
            }
        }
        updateState(addr);
        emit Release(addr, amt, ccy);
    }

    /**
    * @dev Triggers to withdraw collateral for msg.sender
    * @param amt Amount of collateral to withdraw
    *
    * @notice Requires collateral to be IN_USE or AVAILABLE reverts otherwise
    */
    function withdraw(uint256 amt) public {
        ColBook memory book = colMap[msg.sender];
        require(book.isAvailable, "not registered yet");
        require(book.state == CollateralState.IN_USE || book.state == CollateralState.AVAILABLE, " CollateralState should be IN_USE or AVAILABLE");
        uint256 totalUse = calculatePVinETH(msg.sender);
        if (totalUse == 0) {
            require(book.colAmtETH >= amt, "Can't withdraw more than collateral");
            colMap[msg.sender].colAmtETH = book.colAmtETH.sub(amt);
            msg.sender.transfer(amt);
        } else {
            uint256 coverage = (PCT.mul(book.colAmtETH)).div(totalUse);
            require(coverage >= MARGINLEVEL);
            uint256 delta = coverage.sub(MARGINLEVEL);
            uint256 subAmt = (totalUse.mul(delta)).div(PCT);
            require(subAmt >= amt, "Can't withdraw more than 150% coverage");
            colMap[msg.sender].colAmtETH = book.colAmtETH.sub(amt);
            msg.sender.transfer(amt);
        }
        updateState(msg.sender);
        emit Withdraw(msg.sender, amt);
    }

    /**@dev
        CollateralState Management Section
        1. update states
        2. notify - confirm method to change states

        // TODO - modify totalUsedETH after loan is executed
        // TODO - update loan mtm condition and change state
    */

    /**
    * @dev Triggers to update state of users collateral book
    * @param addr User address
    *
    * @notice Trigers only be Loan contract
    */
    function updateState(address addr) public returns (CollateralState) {
        ColBook storage book = colMap[addr];
        CollateralState prevState = book.state;
        uint256 totalUse = calculatePVinETH(addr);

        if (totalUse == 0) {
            if (book.colAmtETH == 0) book.state = CollateralState.EMPTY;
            if (book.colAmtETH > 0) book.state = CollateralState.AVAILABLE;
        } else if (totalUse > 0) {
            uint256 coverage = (PCT.mul(book.colAmtETH)).div(totalUse);

            if (book.state == CollateralState.LIQUIDATION_IN_PROGRESS) return book.state;
            if (book.colAmtETH > 0 && coverage <= AUTOLQLEVEL)
                book.state = CollateralState.LIQUIDATION;
            if (book.colAmtETH > 0 && coverage > AUTOLQLEVEL && coverage < MARGINLEVEL)
                book.state = CollateralState.MARGIN_CALL;
            if (book.colAmtETH > 0 && coverage >= MARGINLEVEL)
                book.state = CollateralState.IN_USE;
        }
        if (prevState != book.state) {
            emit UpdateState(addr, prevState, book.state);
        }
        return book.state;
    }

    // update state all
    function updateAllState() public {
        for (uint256 i = 0; i < users.length; i++) {
            updateState(users[i]);
        }
    }

    /**
    * @dev Triggers to update PV value in currency for collateral book
    * changes present value in native currency, without exchange rate conversion
    * @param addr Collateral book address
    * @param prevPV Previous snapshot present value
    * @param amount New present value
    * @param ccy Currency to change PV value for
    *
    * @notice Trigers only be Loan contract
    */
    function updatePV(
        address addr,
        uint256 prevPV,
        uint256 amount,
        Ccy ccy
    ) external {
        require(msg.sender == address(loan), "only Loan contract can call");
        ColBook storage book = colMap[addr];
        if (ccy == Ccy.ETH) {
            book.totalUsedETH = book.totalUsedETH.sub(prevPV).add(amount);
        } else {
            if (ccy == Ccy.FIL) {
                book.totalUsedFIL = book.totalUsedFIL.sub(prevPV).add(amount);
            } else if (ccy == Ccy.USDC) {
                book.totalUsedUSDC = book.totalUsedUSDC.sub(prevPV).add(amount);
            } else if (ccy == Ccy.BTC) {
                book.totalUsedBTC = book.totalUsedBTC.sub(prevPV).add(amount);
            }
        }
        updateState(addr);
        emit UpdatePV(addr, prevPV, amount, ccy);
    }

    /**
    * @dev Triggers to liquidate collateral from borrower to lender
    * @param from Address for liquidating collateral from
    * @param to Address for sending collateral to
    * @param amount Liquidation amount
    * @param ccy Currency to use rate to ETH for
    *
    * @notice Trigers only be Loan contract
    */
    function liquidate(
        address from,
        address to,
        uint256 amount,
        Ccy ccy
    ) external {
        require(msg.sender == address(loan), "only Loan contract can call");
        ColBook storage borrowerBook = colMap[from];
        uint256 amt = ratesAggregator.convertToETH(uint8(ccy), amount);
        require(borrowerBook.colAmtETH >= amt, "Liquidation amount not enough");
        if (
            borrowerBook.state == CollateralState.IN_USE ||
            borrowerBook.state == CollateralState.LIQUIDATION
        ) {
            borrowerBook.colAmtETH = borrowerBook.colAmtETH.sub(amt);
            colMap[to].colAmtETH = colMap[to].colAmtETH.add(amt);
            updateState(from);
            updateState(to);
        }
        emit Liquidate(from, to, amt);
    }

    function getOneBook(address addr) public view returns (ColBook memory) {
        return colMap[addr];
    }

    function getAllBooks() public view returns (ColBook[] memory) {
        ColBook[] memory allBooks = new ColBook[](users.length);
        for (uint256 i = 0; i < users.length; i++) {
            allBooks[i] = colMap[users[i]];
        }
        return allBooks;
    }

    function getAllUsers() public view returns (address[] memory) {
        return users;
    }

    function getColState(address addr) public view returns (CollateralState) {
        return colMap[addr].state;
    }
}
