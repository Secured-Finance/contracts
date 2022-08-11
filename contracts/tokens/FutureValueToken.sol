// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IFutureValueToken} from "../interfaces/IFutureValueToken.sol";
import {MixinAddressResolverV2} from "../mixins/MixinAddressResolverV2.sol";
import {Contracts} from "../libraries/Contracts.sol";
import {Ownable} from "../utils/Ownable.sol";
import {Proxyable} from "../utils/Proxyable.sol";
import {FutureValueTokenStorage as Storage} from "../storages/FutureValueTokenStorage.sol";

/**
 * @title FutureValueToken contract is used to store the future value as a token for Lending deals.
 */
contract FutureValueToken is MixinAddressResolverV2, IFutureValueToken, Ownable, Proxyable {
    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address _owner,
        address _resolver,
        bytes32 _ccy,
        uint256 _marketNo,
        uint256 _maturity
    ) public initializer onlyProxy {
        Storage.slot().ccy = _ccy;
        Storage.slot().marketNo = _marketNo;
        Storage.slot().maturity = _maturity;

        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function totalLendingSupply(uint256 _maturity) external view virtual returns (uint256) {
        return Storage.slot().totalLendingSupply[_maturity];
    }

    function totalBorrowingSupply(uint256 _maturity) external view virtual returns (uint256) {
        return Storage.slot().totalBorrowingSupply[_maturity];
    }

    function getMaturity(address _account) external view returns (uint256) {
        return Storage.slot().balanceMaturities[_account];
    }

    function getMaturity() external view returns (uint256) {
        return Storage.slot().maturity;
    }

    function getCcy() external view returns (bytes32) {
        return Storage.slot().ccy;
    }

    function balanceInMaturityOf(address account) external view override returns (int256, uint256) {
        return (Storage.slot().balances[account], Storage.slot().balanceMaturities[account]);
    }

    function hasPastMaturityBalance(address account) public view returns (bool) {
        if (Storage.slot().balanceMaturities[account] == Storage.slot().maturity) {
            return false;
        } else {
            return Storage.slot().balances[account] > 0;
        }
    }

    function updateMaturity(uint256 _maturity) external {
        require(_maturity > Storage.slot().maturity, "old maturity date");
        Storage.slot().maturity = _maturity;
    }

    // =========== ERC20 FUNCTIONS ===========

    function totalSupply() external view returns (uint256) {
        return Storage.slot().totalLendingSupply[Storage.slot().maturity];
    }

    function balanceOf(address account) external view override returns (int256) {
        return
            Storage.slot().balanceMaturities[account] == Storage.slot().maturity
                ? Storage.slot().balances[account]
                : int256(0);
    }

    function mint(
        address lender,
        address borrower,
        uint256 amount
    ) external override onlyAcceptedContracts returns (bool) {
        _mint(lender, borrower, amount);
        return true;
    }

    function burnFrom(address account) external virtual onlyAcceptedContracts returns (int256) {
        int256 balance = Storage.slot().balances[account];
        uint256 maturity = Storage.slot().balanceMaturities[account];

        if (balance >= 0) {
            Storage.slot().totalLendingSupply[maturity] -= uint256(balance);
        } else {
            Storage.slot().totalBorrowingSupply[maturity] -= uint256(-balance);
        }

        Storage.slot().balances[account] = 0;

        emit Transfer(account, address(0), balance);

        return balance;
    }

    function _mint(
        address lender,
        address borrower,
        uint256 amount
    ) internal {
        require(lender != borrower, "borrower and lender are the same");
        require(lender != address(0), "mint to the zero address of lender");
        require(borrower != address(0), "mint to the zero address of borrower");
        require(!hasPastMaturityBalance(lender), "lender has balance in past maturity");
        require(!hasPastMaturityBalance(borrower), "borrower has balance in past maturity");

        uint256 maturity = Storage.slot().maturity;
        Storage.slot().balanceMaturities[lender] = maturity;
        Storage.slot().balanceMaturities[borrower] = maturity;

        Storage.slot().totalLendingSupply[maturity] += amount;
        Storage.slot().totalBorrowingSupply[maturity] += amount;

        Storage.slot().balances[lender] += int256(amount);
        Storage.slot().balances[borrower] -= int256(amount);

        emit Transfer(address(0), lender, int256(amount));
        emit Transfer(address(0), borrower, -int256(amount));
    }
}
