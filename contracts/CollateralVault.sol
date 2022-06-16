// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./interfaces/ICollateralVault.sol";
import "./libraries/SafeTransfer.sol";
import "./libraries/CollateralPosition.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/Ownable.sol";
import "./utils/Proxyable.sol";
import {CollateralVaultStorage as Storage} from "./storages/CollateralVaultStorage.sol";

/**
 * @title CollateralVault is the main implementation contract for storing and keeping user's collateral
 *
 * This contract allows users to deposit and withdraw their funds to fulfill
 * their collateral obligations against different trades.
 *
 * CollateralVault is working with ETH or ERC20 token with specified on deployment `tokenAddress`.
 *
 * CollateralAggregator uses independent Collateral vaults for rebalancing collateral
 * between global books and bilateral positions, and liquidating collateral while performing
 * single or multi-deal liquidation.
 *
 */
contract CollateralVault is
    ICollateralVault,
    MixinAddressResolver,
    Ownable,
    SafeTransfer,
    Proxyable
{
    /**
     * @dev Modifier to check if user registered on collateral aggregator
     */
    modifier onlyRegisteredUser() {
        require(collateralAggregator().checkRegisteredUser(msg.sender), "User not registered");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address owner,
        address resolver,
        address WETH9
    ) public initializer onlyProxy {
        _transferOwnership(owner);
        _registerToken(WETH9);
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
    }

    function registerCurrency(bytes32 _ccy, address _tokenAddress) external onlyOwner {
        require(currencyController().isCollateral(_ccy), "Invalid currency");
        Storage.slot().tokenAddress[_ccy] = _tokenAddress;
    }

    /**
     * @dev Trigers to deposit funds by the msg.sender into collateral book
     * @param _ccy The currency for this vault
     * @param _amount Number of funds to deposit
     */
    function deposit(bytes32 _ccy, uint256 _amount) public payable override onlyRegisteredUser {
        require(Storage.slot().tokenAddress[_ccy] != address(0), "Invalid currency");
        require(_amount > 0, "Invalid amount");
        _depositAssets(Storage.slot().tokenAddress[_ccy], msg.sender, address(this), _amount);

        Storage.Book storage book = Storage.slot().books[_ccy][msg.sender];
        book.independentAmount = book.independentAmount + _amount;

        _afterTransfer(_ccy);

        emit Deposit(_ccy, msg.sender, _amount);
    }

    /**
     * @dev Deposit collateral funds into bilateral position against counterparty
     * @param _counterparty Counterparty address in bilateral position
     * @notice payable function increases locked collateral by msg.value
     */
    function deposit(
        bytes32 _ccy,
        address _counterparty,
        uint256 _amount
    ) public override onlyRegisteredUser {
        require(Storage.slot().tokenAddress[_ccy] != address(0), "Invalid currency");
        require(_amount > 0, "Invalid amount");
        _depositAssets(Storage.slot().tokenAddress[_ccy], msg.sender, address(this), _amount);

        CollateralPosition.deposit(
            Storage.slot().positions[_ccy],
            msg.sender,
            _counterparty,
            _amount
        );

        Storage.Book storage book = Storage.slot().books[_ccy][msg.sender];
        book.lockedCollateral = book.lockedCollateral + _amount;

        _afterTransfer(_ccy, _counterparty);

        emit PositionDeposit(_ccy, msg.sender, _counterparty, _amount);
    }

    struct RebalanceLocalVars {
        int256 exchangeRate;
        uint256 target;
        uint256 rebalanceAmount;
        uint256 left;
    }

    /**
     * @dev Rebalances collateral from user's book to bilateral position,
     * as it's executed by collateral aggregator function returns the
     * amount of ETH left to rebalance for other collateral vaults
     *
     * @param _user Main user address to rebalance collateral from
     * @param _counterparty Counterparty address in bilateral position
     * @param _amountETH Amount of funds in ETH required to rebalance
     *
     * @return Amount of funds in ETH left to rebalance for other vault
     */
    function rebalanceTo(
        bytes32 _ccy,
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external override onlyAcceptedContracts returns (uint256) {
        RebalanceLocalVars memory vars;
        vars.exchangeRate = currencyController().getLastETHPrice(_ccy);
        vars.target = (_amountETH * 1e18) / uint256(vars.exchangeRate);

        Storage.Book storage book = Storage.slot().books[_ccy][_user];
        vars.rebalanceAmount = book.independentAmount >= vars.target
            ? vars.target
            : book.independentAmount;

        if (vars.rebalanceAmount > 0) {
            book.independentAmount = book.independentAmount - vars.rebalanceAmount;
            book.lockedCollateral = book.lockedCollateral + vars.rebalanceAmount;

            CollateralPosition.deposit(
                Storage.slot().positions[_ccy],
                _user,
                _counterparty,
                vars.rebalanceAmount
            );
            _afterTransfer(_ccy, _user, _counterparty);

            emit RebalanceTo(_ccy, _user, _counterparty, vars.rebalanceAmount);
        }

        vars.left = vars.target - vars.rebalanceAmount;

        return (vars.left * uint256(vars.exchangeRate)) / 1e18;
    }

    /**
     * @dev Rebalances collateral from bilateral position to user's book,
     * as it's executed by collateral aggregator function returns the
     * amount of ETH left to rebalance for other collateral vaults
     *
     * @param _user Main user address to rebalance collateral from
     * @param _counterparty Counterparty address in bilateral position
     * @param _amountETH Amount of funds in ETH required to rebalance
     *
     * @return Amount of funds in ETH left to rebalance for other vault
     */
    function rebalanceFrom(
        bytes32 _ccy,
        address _user,
        address _counterparty,
        uint256 _amountETH
    ) external override onlyAcceptedContracts returns (uint256) {
        RebalanceLocalVars memory vars;

        vars.exchangeRate = currencyController().getLastETHPrice(_ccy);
        vars.target = (_amountETH * 1e18) / uint256(vars.exchangeRate);
        vars.rebalanceAmount = CollateralPosition.withdraw(
            Storage.slot().positions[_ccy],
            _user,
            _counterparty,
            vars.target
        );

        if (vars.rebalanceAmount > 0) {
            Storage.Book storage book = Storage.slot().books[_ccy][_user];
            book.lockedCollateral = book.lockedCollateral - vars.rebalanceAmount;
            book.independentAmount = book.independentAmount + vars.rebalanceAmount;

            _afterTransfer(_ccy, _user, _counterparty);

            emit RebalanceFrom(_ccy, _user, _counterparty, vars.rebalanceAmount);
        }

        vars.left = vars.target - vars.rebalanceAmount;

        return (vars.left * uint256(vars.exchangeRate)) / 1e18;
    }

    /**
     * @dev Rebalances collateral between 2 different bilateral positions,
     * as it's executed by collateral aggregator function returns the
     * amount of ETH left to rebalance for other collateral vaults
     *
     * @param _user Main user address to rebalance collateral from
     * @param _fromParty Counterparty address to rebalance from
     * @param _toParty Counterparty address to rebalance to
     * @param _amountETH Amount of funds in ETH required to rebalance
     *
     * @return Amount of funds in ETH left to rebalance for other vault
     */
    function rebalanceBetween(
        bytes32 _ccy,
        address _user,
        address _fromParty,
        address _toParty,
        uint256 _amountETH
    ) external override onlyAcceptedContracts returns (uint256) {
        RebalanceLocalVars memory vars;

        vars.exchangeRate = currencyController().getLastETHPrice(_ccy);
        vars.target = (_amountETH * 1e18) / uint256(vars.exchangeRate);
        vars.rebalanceAmount = CollateralPosition.rebalance(
            Storage.slot().positions[_ccy],
            _user,
            _fromParty,
            _toParty,
            vars.target
        );
        vars.left = vars.target - vars.rebalanceAmount;

        _afterTransfer(_ccy, _user, _fromParty);
        _afterTransfer(_ccy, _user, _toParty);

        emit RebalanceBetween(_ccy, _user, _fromParty, _toParty, vars.rebalanceAmount);

        return (vars.left * uint256(vars.exchangeRate)) / 1e18;
    }

    /**
     * @dev Liquidates collateral from bilateral position between parties
     * returns the amount of ETH to be liquidated in other vault
     * if all available funds have been liquidated here
     *
     * @param _from Address for liquidating collateral from
     * @param _to Address for sending collateral to
     * @param _amountETH Liquidation amount in ETH
     *
     * @notice Trigers only be Loan contract
     */
    function liquidate(
        bytes32 _ccy,
        address _from,
        address _to,
        uint256 _amountETH
    ) external override onlyAcceptedContracts returns (uint256 liquidationLeftETH) {
        int256 exchangeRate = currencyController().getLastETHPrice(_ccy);
        uint256 liquidationTarget = (_amountETH * 1e18) / uint256(exchangeRate);
        uint256 liquidated = CollateralPosition.liquidate(
            Storage.slot().positions[_ccy],
            _from,
            _to,
            liquidationTarget
        );

        Storage.Book storage book = Storage.slot().books[_ccy][_from];
        book.lockedCollateral = book.lockedCollateral - liquidated;

        book = Storage.slot().books[_ccy][_to];
        book.lockedCollateral = book.lockedCollateral + liquidated;

        if (liquidated > 0) {
            _afterTransfer(_ccy, _from, _to);
            emit Liquidate(_ccy, _from, _to, liquidated);
        }

        uint256 liquidationLeft = liquidationTarget - liquidated;

        if (liquidationLeft > 0) {
            uint256 independentLiquidation = _tryLiquidateIndependentCollateral(
                _ccy,
                _from,
                _to,
                liquidationLeft
            );
            liquidationLeft = liquidationLeft - independentLiquidation;
        }

        liquidationLeftETH = (liquidationLeft * uint256(exchangeRate)) / 1e18;
    }

    function _tryLiquidateIndependentCollateral(
        bytes32 _ccy,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (uint256 liquidated) {
        uint256 maxWidthdrawETH = collateralAggregator().getMaxCollateralBookWidthdraw(_from);
        uint256 maxLiquidation = currencyController().convertFromETH(_ccy, maxWidthdrawETH);

        liquidated = _amount > maxLiquidation ? maxLiquidation : _amount;

        Storage.Book storage book = Storage.slot().books[_ccy][_from];
        book.independentAmount = book.independentAmount - liquidated;

        book = Storage.slot().books[_ccy][_to];
        book.lockedCollateral = book.lockedCollateral + liquidated;

        CollateralPosition.deposit(Storage.slot().positions[_ccy], _to, _from, liquidated);

        emit LiquidateIndependent(_ccy, _from, _to, liquidated);
    }

    /**
     * @notice Trigers to withdraw funds by the msg.sender from non-locked funds
     * @param _amount Number of funds to withdraw.
     */
    function withdraw(bytes32 _ccy, uint256 _amount) public override onlyRegisteredUser {
        // fix according to collateral aggregator
        require(_amount > 0, "INVALID_AMOUNT");

        address user = msg.sender;
        uint256 maxWidthdrawETH = collateralAggregator().getMaxCollateralBookWidthdraw(user);
        uint256 maxWidthdraw = currencyController().convertFromETH(_ccy, maxWidthdrawETH);
        uint256 withdrawAmt = _amount > maxWidthdraw ? maxWidthdraw : _amount;

        Storage.Book storage book = Storage.slot().books[_ccy][user];
        book.independentAmount = book.independentAmount - withdrawAmt;

        _withdrawAssets(Storage.slot().tokenAddress[_ccy], msg.sender, withdrawAmt);
        _afterTransfer(_ccy);

        emit Withdraw(_ccy, msg.sender, withdrawAmt);
    }

    /**
     * @notice Trigers to withdraw funds from bilateral position between
     * msg.sender and _counterparty
     *
     * @param _counterparty Counterparty address.
     * @param _amount Number of funds to withdraw.
     */
    function withdrawFrom(
        bytes32 _ccy,
        address _counterparty,
        uint256 _amount
    ) public override onlyRegisteredUser {
        require(_amount > 0, "INVALID_AMOUNT");
        address user = msg.sender;

        (uint256 maxWidthdrawETH, ) = collateralAggregator().getMaxCollateralWidthdraw(
            user,
            _counterparty
        );
        uint256 maxWidthdraw = currencyController().convertFromETH(_ccy, maxWidthdrawETH);

        uint256 targetWithdraw = _amount > maxWidthdraw ? maxWidthdraw : _amount;
        uint256 withdrawn = CollateralPosition.withdraw(
            Storage.slot().positions[_ccy],
            user,
            _counterparty,
            targetWithdraw
        );

        Storage.Book storage book = Storage.slot().books[_ccy][user];
        book.lockedCollateral = book.lockedCollateral - withdrawn;

        _withdrawAssets(Storage.slot().tokenAddress[_ccy], msg.sender, withdrawn);
        _afterTransfer(_ccy, _counterparty);

        emit PositionWithdraw(_ccy, user, _counterparty, withdrawn);
    }

    /**
     * @notice Returns independent collateral from `_user` collateral book
     *
     * @param _user Address of collateral user
     */
    function getIndependentCollateral(bytes32 _ccy, address _user)
        public
        view
        override
        returns (uint256)
    {
        return Storage.slot().books[_ccy][_user].independentAmount;
    }

    /**
     * @notice Returns independent collateral from `_user` collateral book converted to ETH
     *
     * @param _user Address of collateral user
     */
    function getIndependentCollateralInETH(bytes32 _ccy, address _user)
        public
        view
        override
        returns (uint256)
    {
        uint256 amount = Storage.slot().books[_ccy][_user].independentAmount;

        return currencyController().convertToETH(_ccy, amount);
    }

    /**
     * @notice Returns locked collateral by `_user` in collateral book
     *
     * @param _user Address of collateral user
     */
    function getLockedCollateral(bytes32 _ccy, address _user)
        public
        view
        override
        returns (uint256)
    {
        return Storage.slot().books[_ccy][_user].lockedCollateral;
    }

    /**
     * @notice Returns locked collateral by `_user` in collateral book converted to ETH
     *
     * @param _user Address of collateral user
     */
    function getLockedCollateralInETH(bytes32 _ccy, address _user)
        public
        view
        override
        returns (uint256)
    {
        uint256 amount = Storage.slot().books[_ccy][_user].lockedCollateral;

        return currencyController().convertToETH(_ccy, amount);
    }

    /**
     * @notice Returns locked collateral by counterparties
     * in a bilateral position in native `ccy`
     *
     * @param _partyA First counterparty address
     * @param _partyB Second counterparty address.
     */
    function getLockedCollateral(
        bytes32 _ccy,
        address _partyA,
        address _partyB
    ) public view override returns (uint256, uint256) {
        return CollateralPosition.get(Storage.slot().positions[_ccy], _partyA, _partyB);
    }

    /**
     * @notice Returns locked collateral by counterparties
     * in a bilateral position converted to ETH
     *
     * @param _partyA First counterparty address
     * @param _partyB Second counterparty address.
     */
    function getLockedCollateralInETH(
        bytes32 _ccy,
        address _partyA,
        address _partyB
    ) public view override returns (uint256, uint256) {
        (uint256 lockedA, uint256 lockedB) = CollateralPosition.get(
            Storage.slot().positions[_ccy],
            _partyA,
            _partyB
        );

        uint256[] memory ethAmounts = new uint256[](2);
        ethAmounts[0] = lockedA;
        ethAmounts[1] = lockedB;

        ethAmounts = currencyController().convertBulkToETH(_ccy, ethAmounts);

        return (ethAmounts[0], ethAmounts[1]);
    }

    function _afterTransfer(bytes32 _ccy) internal {
        if (
            Storage.slot().books[_ccy][msg.sender].independentAmount > 0 ||
            Storage.slot().books[_ccy][msg.sender].lockedCollateral > 0
        ) {
            collateralAggregator().enterVault(msg.sender, _ccy);
        } else {
            collateralAggregator().exitVault(msg.sender, _ccy);
        }
    }

    function _afterTransfer(bytes32 _ccy, address _counterparty) internal {
        _afterTransfer(_ccy, msg.sender, _counterparty);
    }

    function _afterTransfer(
        bytes32 _ccy,
        address _user,
        address _counterparty
    ) internal {
        (uint256 locked0, uint256 locked1) = CollateralPosition.get(
            Storage.slot().positions[_ccy],
            _user,
            _counterparty
        );

        if (locked0 > 0) {
            collateralAggregator().enterVault(_user, _ccy);
        }

        if (locked1 > 0) {
            collateralAggregator().enterVault(_counterparty, _ccy);
        }

        if (locked0 > 0 || locked1 > 0) {
            collateralAggregator().enterVault(_user, _counterparty, _ccy);
        } else {
            collateralAggregator().exitVault(_user, _counterparty, _ccy);
        }
    }
}
