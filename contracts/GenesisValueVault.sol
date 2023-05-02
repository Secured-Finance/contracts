// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

// interfaces
import {IGenesisValueVault} from "./interfaces/IGenesisValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
import {RoundingInt256} from "./libraries/math/RoundingInt256.sol";
import {FullMath} from "./libraries/math/FullMath.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {GenesisValueVaultStorage as Storage, AutoRollLog} from "./storages/GenesisValueVaultStorage.sol";

/**
 * @notice Implements the management of the genesis value as an amount for Lending deals.
 */
contract GenesisValueVault is IGenesisValueVault, MixinAddressResolver, Proxyable {
    using SafeCast for uint256;
    using SafeCast for int256;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _resolver) public initializer onlyProxy {
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[1] = Contracts.RESERVE_FUND;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function isInitialized(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().isInitialized[_ccy];
    }

    function decimals(bytes32 _ccy) public view override returns (uint8) {
        return Storage.slot().decimals[_ccy];
    }

    function getTotalLendingSupply(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().totalLendingSupplies[_ccy];
    }

    function getTotalBorrowingSupply(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().totalBorrowingSupplies[_ccy];
    }

    function getGenesisValue(bytes32 _ccy, address _user) public view override returns (int256) {
        (int256 balance, int256 fluctuation) = _getActualBalance(
            _ccy,
            _user,
            getCurrentMaturity(_ccy)
        );
        return balance + fluctuation;
    }

    function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity)
        external
        view
        override
        returns (int256)
    {
        return Storage.slot().maturityBalances[_ccy][_maturity];
    }

    function getCurrentMaturity(bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().currentMaturity[_ccy];
    }

    function getLendingCompoundFactor(bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().lendingCompoundFactors[_ccy];
    }

    function getBorrowingCompoundFactor(bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().borrowingCompoundFactors[_ccy];
    }

    function getAutoRollLog(bytes32 _ccy, uint256 _maturity)
        external
        view
        override
        returns (AutoRollLog memory)
    {
        return Storage.slot().autoRollLogs[_ccy][_maturity];
    }

    function getLatestAutoRollLog(bytes32 _ccy)
        external
        view
        override
        returns (AutoRollLog memory)
    {
        return Storage.slot().autoRollLogs[_ccy][Storage.slot().currentMaturity[_ccy]];
    }

    function getGenesisValueInFutureValue(bytes32 _ccy, address _user)
        external
        view
        override
        returns (int256)
    {
        // NOTE: The formula is:
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (getGenesisValue(_ccy, _user) * getLendingCompoundFactor(_ccy).toInt256()).div(
                (10**decimals(_ccy)).toInt256()
            );
    }

    function calculateFVFromFV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        uint256 _destinationMaturity,
        int256 _futureValue
    ) external view override returns (int256) {
        if (_futureValue == 0) {
            return 0;
        } else if (_basisMaturity == _destinationMaturity) {
            return _futureValue;
        } else {
            // NOTE: These calculation steps "FV -> GV -> FV" are needed to match the actual conversion step.
            // Otherwise, Solidity's truncation specification creates a difference in the calculated values.
            // The formula is:
            // genesisValue = featureValueInMaturity / compoundFactorInMaturity.
            // currentFeatureValue = genesisValue * currentCompoundFactor
            int256 genesisValue = calculateGVFromFV(_ccy, _basisMaturity, _futureValue);
            return calculateFVFromGV(_ccy, _destinationMaturity, genesisValue);
        }
    }

    function calculateGVFromFV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) public view override returns (int256) {
        uint256 compoundFactor = _basisMaturity == 0 ||
            _basisMaturity == Storage.slot().currentMaturity[_ccy]
            ? getLendingCompoundFactor(_ccy)
            : Storage.slot().autoRollLogs[_ccy][_basisMaturity].lendingCompoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");

        // NOTE: The formula is: genesisValue = featureValue / compoundFactor.
        bool isPlus = _futureValue > 0;
        uint256 absFv = (isPlus ? _futureValue : -_futureValue).toUint256();
        uint256 absGv = (absFv * 10**decimals(_ccy)).div(compoundFactor);
        return isPlus ? absGv.toInt256() : -(absGv.toInt256());
    }

    function calculateFVFromGV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _genesisValue
    ) public view override returns (int256) {
        uint256 compoundFactor = _basisMaturity == 0 ||
            _basisMaturity == Storage.slot().currentMaturity[_ccy]
            ? getLendingCompoundFactor(_ccy)
            : Storage.slot().autoRollLogs[_ccy][_basisMaturity].lendingCompoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");
        bool isPlus = _genesisValue > 0;
        uint256 absGv = (isPlus ? _genesisValue : -_genesisValue).toUint256();
        uint256 absFv = (absGv * compoundFactor).div(10**decimals(_ccy));

        return isPlus ? absFv.toInt256() : -(absFv.toInt256());
    }

    function initializeCurrencySetting(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _compoundFactor,
        uint256 _maturity
    ) external override onlyAcceptedContracts {
        require(_compoundFactor != 0, "Compound factor is zero");
        require(!isInitialized(_ccy), "Already initialized currency");

        Storage.slot().isInitialized[_ccy] = true;
        Storage.slot().decimals[_ccy] = _decimals;
        Storage.slot().initialCompoundFactors[_ccy] = _compoundFactor;
        Storage.slot().lendingCompoundFactors[_ccy] = _compoundFactor;
        Storage.slot().borrowingCompoundFactors[_ccy] = _compoundFactor;
        Storage.slot().currentMaturity[_ccy] = _maturity;

        // Update autoRollLogs by initial compound factor.
        // These values are updated by the first Itayose call of the nearest maturity market
        // if it is executed.
        Storage.slot().autoRollLogs[_ccy][_maturity] = AutoRollLog({
            unitPrice: ProtocolTypes.PRICE_DIGIT,
            lendingCompoundFactor: _compoundFactor,
            borrowingCompoundFactor: _compoundFactor,
            prev: 0,
            next: 0
        });
    }

    function updateInitialCompoundFactor(bytes32 _ccy, uint256 _unitPrice)
        external
        override
        onlyAcceptedContracts
    {
        uint256 maturity = Storage.slot().currentMaturity[_ccy];

        require(
            Storage.slot().autoRollLogs[_ccy][maturity].prev == 0,
            "First autoRollLog already finalized"
        );

        _updateCompoundFactor(_ccy, _unitPrice, 0);
        Storage.slot().autoRollLogs[_ccy][maturity] = AutoRollLog({
            unitPrice: _unitPrice,
            lendingCompoundFactor: Storage.slot().lendingCompoundFactors[_ccy],
            borrowingCompoundFactor: Storage.slot().borrowingCompoundFactors[_ccy],
            prev: 0,
            next: 0
        });
    }

    function executeAutoRoll(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice,
        uint256 _feeRate,
        uint256 _totalFVAmount
    ) external override onlyAcceptedContracts {
        _updateCompoundFactor(_ccy, _unitPrice, _feeRate);
        _updateAutoRollLogs(_ccy, _maturity, _nextMaturity, _unitPrice);
        _registerMaximumTotalSupply(_ccy, _maturity, _totalFVAmount);

        emit AutoRollExecuted(
            _ccy,
            Storage.slot().lendingCompoundFactors[_ccy],
            Storage.slot().borrowingCompoundFactors[_ccy],
            _unitPrice,
            _nextMaturity,
            _maturity
        );
    }

    function _updateAutoRollLogs(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice
    ) private {
        require(_unitPrice != 0, "Unit price is zero");
        require(Storage.slot().autoRollLogs[_ccy][_maturity].next == 0, "Already updated maturity");
        require(_nextMaturity > _maturity, "Invalid maturity");
        require(
            Storage.slot().autoRollLogs[_ccy][_nextMaturity].lendingCompoundFactor == 0,
            "Existed maturity"
        );

        require(
            Storage.slot().autoRollLogs[_ccy][_maturity].lendingCompoundFactor != 0,
            "Invalid lending compound factor"
        );
        require(
            Storage.slot().autoRollLogs[_ccy][_maturity].borrowingCompoundFactor != 0,
            "Invalid borrowing compound factor"
        );

        Storage.slot().currentMaturity[_ccy] = _nextMaturity;

        Storage.slot().autoRollLogs[_ccy][_maturity].next = _nextMaturity;
        Storage.slot().autoRollLogs[_ccy][_nextMaturity] = AutoRollLog({
            unitPrice: _unitPrice,
            lendingCompoundFactor: Storage.slot().lendingCompoundFactors[_ccy],
            borrowingCompoundFactor: Storage.slot().borrowingCompoundFactors[_ccy],
            prev: _maturity,
            next: 0
        });
    }

    function updateGenesisValueWithFutureValue(
        bytes32 _ccy,
        address _user,
        uint256 _basisMaturity,
        int256 _fvAmount
    ) external override onlyAcceptedContracts {
        int256 amount = calculateGVFromFV(_ccy, _basisMaturity, _fvAmount);

        _updateBalance(_ccy, _user, _basisMaturity, amount);
    }

    function updateGenesisValueWithResidualAmount(
        bytes32 _ccy,
        address _user,
        uint256 _basisMaturity
    ) external override onlyAcceptedContracts {
        int256 residualGVAmount = Storage.slot().maturityBalances[_ccy][_basisMaturity];

        _updateBalance(_ccy, _user, _basisMaturity, -residualGVAmount);

        require(
            Storage.slot().maturityBalances[_ccy][_basisMaturity] == 0,
            "Residual amount exists"
        );
    }

    function offsetGenesisValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _lender,
        address _borrower,
        int256 _maximumGVAmount
    ) external override onlyAcceptedContracts returns (int256 offsetAmount) {
        int256 lenderGVAmount = getGenesisValue(_ccy, _lender);
        int256 borrowerGVAmount = getGenesisValue(_ccy, _borrower);

        if (lenderGVAmount <= 0 || borrowerGVAmount >= 0) {
            return 0;
        } else {
            offsetAmount = lenderGVAmount;
        }

        if (-borrowerGVAmount < lenderGVAmount) {
            offsetAmount = -borrowerGVAmount;
        }

        if (_maximumGVAmount != 0 && offsetAmount > _maximumGVAmount) {
            offsetAmount = _maximumGVAmount;
        }

        _updateBalance(_ccy, _lender, _maturity, -offsetAmount);
        _updateBalance(_ccy, _borrower, _maturity, offsetAmount);
    }

    function transferFrom(
        bytes32 _ccy,
        address _sender,
        address _receiver,
        int256 _amount
    ) external override onlyAcceptedContracts {
        Storage.slot().balances[_ccy][_sender] -= _amount;
        Storage.slot().balances[_ccy][_receiver] += _amount;

        emit Transfer(_ccy, _sender, _receiver, _amount);
    }

    function cleanUpGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _maturity
    ) external override onlyAcceptedContracts {
        uint256 maturity = _maturity == 0 ? getCurrentMaturity(_ccy) : _maturity;
        int256 fluctuation = _getBalanceFluctuationByAutoRolls(_ccy, _user, maturity);

        if (fluctuation < 0) {
            address reserveFundAddr = address(reserveFund());

            _updateTotalSupplies(_ccy, fluctuation, Storage.slot().balances[_ccy][_user]);
            _updateTotalSupplies(
                _ccy,
                -fluctuation,
                Storage.slot().balances[_ccy][reserveFundAddr]
            );

            Storage.slot().userMaturities[_ccy][_user] = maturity;
            Storage.slot().balances[_ccy][_user] += fluctuation;
            Storage.slot().balances[_ccy][reserveFundAddr] += -fluctuation;

            emit Transfer(_ccy, _user, reserveFundAddr, -fluctuation);
        }
    }

    /**
     * @notice Resets all genesis values of the user.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     */
    function resetGenesisValue(bytes32 _ccy, address _user)
        external
        override
        onlyAcceptedContracts
    {
        int256 removedAmount = Storage.slot().balances[_ccy][_user];
        if (removedAmount != 0) {
            Storage.slot().balances[_ccy][_user] = 0;

            emit Transfer(_ccy, _user, address(0), removedAmount);
        }
    }

    function getBalanceFluctuationByAutoRolls(
        bytes32 _ccy,
        address _user,
        uint256 _maturity
    ) external view override returns (int256 fluctuation) {
        uint256 maturity = _maturity == 0 ? getCurrentMaturity(_ccy) : _maturity;
        fluctuation = _getBalanceFluctuationByAutoRolls(_ccy, _user, maturity);
    }

    function calculateBalanceFluctuationByAutoRolls(
        bytes32 _ccy,
        int256 _balance,
        uint256 _fromMaturity,
        uint256 _toMaturity
    ) external view override returns (int256 fluctuation) {
        uint256 toMaturity = _toMaturity == 0 ? getCurrentMaturity(_ccy) : _toMaturity;
        fluctuation = _calculateBalanceFluctuationByAutoRolls(
            _ccy,
            _balance,
            _fromMaturity,
            toMaturity
        );
    }

    function _updateBalance(
        bytes32 _ccy,
        address _user,
        uint256 _maturity,
        int256 _amount
    ) private {
        (int256 balance, int256 fluctuation) = _getActualBalance(_ccy, _user, _maturity);
        int256 totalAmount = _amount;

        // Note: `fluctuation` is always 0 or less because the genesis value fluctuates
        // only when it is negative.
        // Here, only the opposite amount of the fluctuation is added to the reserve fund as a fee.
        if (fluctuation < 0) {
            totalAmount += fluctuation;
            address reserveFundAddr = address(reserveFund());
            Storage.slot().balances[_ccy][reserveFundAddr] += -fluctuation;

            _updateTotalSupplies(
                _ccy,
                -fluctuation,
                Storage.slot().balances[_ccy][reserveFundAddr]
            );

            emit Transfer(_ccy, _user, reserveFundAddr, -fluctuation);
        }

        _updateTotalSupplies(_ccy, totalAmount, balance);

        Storage.slot().userMaturities[_ccy][_user] = _maturity;
        Storage.slot().balances[_ccy][_user] += totalAmount;
        Storage.slot().maturityBalances[_ccy][_maturity] += _amount;

        emit Transfer(_ccy, address(0), _user, _amount);
    }

    function _updateTotalSupplies(
        bytes32 _ccy,
        int256 _amount,
        int256 _balance
    ) private {
        if (_amount >= 0) {
            uint256 absAmount = _amount.toUint256();
            if (_balance >= 0) {
                Storage.slot().totalLendingSupplies[_ccy] += absAmount;
            } else {
                int256 diff = _amount + _balance;
                if (diff >= 0) {
                    Storage.slot().totalLendingSupplies[_ccy] += diff.toUint256();
                    Storage.slot().totalBorrowingSupplies[_ccy] -= (-_balance).toUint256();
                } else {
                    Storage.slot().totalBorrowingSupplies[_ccy] -= absAmount;
                }
            }
        } else {
            uint256 absAmount = (-_amount).toUint256();
            if (_balance <= 0) {
                Storage.slot().totalBorrowingSupplies[_ccy] += absAmount;
            } else {
                int256 diff = _amount + _balance;
                if (diff <= 0) {
                    Storage.slot().totalBorrowingSupplies[_ccy] += (-diff).toUint256();
                    Storage.slot().totalLendingSupplies[_ccy] -= _balance.toUint256();
                } else {
                    Storage.slot().totalLendingSupplies[_ccy] -= absAmount;
                }
            }
        }
    }

    function _registerMaximumTotalSupply(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _totalFVAmount
    ) private {
        require(Storage.slot().maximumTotalSupply[_ccy][_maturity] == 0, "Already registered");

        Storage.slot().maximumTotalSupply[_ccy][_maturity] = (_totalFVAmount * 10**decimals(_ccy))
            .div(getLendingCompoundFactor(_ccy));
    }

    function _getActualBalance(
        bytes32 _ccy,
        address _user,
        uint256 _maturity
    ) private view returns (int256 balance, int256 fluctuation) {
        fluctuation = _getBalanceFluctuationByAutoRolls(_ccy, _user, _maturity);
        balance = Storage.slot().balances[_ccy][_user];
    }

    /**
     * @notice Calculates the fluctuation amount of genesis value caused by auto-rolls.
     * @dev The genesis value means the present value of the lending position at the time
     * when the initial market is opened, so the genesis value amount will fluctuate
     * by the fee rate due to auto-rolls if it is negative (equals to the borrowing position).
     * @param _ccy Currency for pausing all lending markets
     * @param _user User's address
     * @return fluctuation The fluctuated genesis value amount
     */
    function _getBalanceFluctuationByAutoRolls(
        bytes32 _ccy,
        address _user,
        uint256 _maturity
    ) private view returns (int256 fluctuation) {
        int256 balance = Storage.slot().balances[_ccy][_user];
        uint256 userMaturity = Storage.slot().userMaturities[_ccy][_user];

        fluctuation = _calculateBalanceFluctuationByAutoRolls(
            _ccy,
            balance,
            userMaturity,
            _maturity
        );
    }

    function _calculateBalanceFluctuationByAutoRolls(
        bytes32 _ccy,
        int256 _balance,
        uint256 _fromMaturity,
        uint256 _toMaturity
    ) private view returns (int256 fluctuation) {
        if (_balance >= 0 || _toMaturity <= _fromMaturity || _fromMaturity == 0) {
            return 0;
        }

        AutoRollLog memory autoRollLog = Storage.slot().autoRollLogs[_ccy][_fromMaturity];

        uint256 destinationBorrowingCF;
        uint256 destinationLendingCF;
        uint256 currentMaturity = getCurrentMaturity(_ccy);

        if (_toMaturity > currentMaturity) {
            return 0;
        } else if (_toMaturity == currentMaturity) {
            destinationBorrowingCF = Storage.slot().borrowingCompoundFactors[_ccy];
            destinationLendingCF = Storage.slot().lendingCompoundFactors[_ccy];
        } else {
            AutoRollLog memory destinationAutoRollLog = Storage.slot().autoRollLogs[_ccy][
                _toMaturity
            ];
            destinationBorrowingCF = destinationAutoRollLog.borrowingCompoundFactor;
            destinationLendingCF = destinationAutoRollLog.lendingCompoundFactor;
        }

        // Note: The formula is:
        // fluctuation = currentBalance * ((currentBCF / userBCF) * (userLCF / currentLCF) - 1)
        fluctuation =
            -FullMath
                .mulDiv(
                    FullMath.mulDiv(
                        (-_balance).toUint256(),
                        destinationBorrowingCF,
                        autoRollLog.borrowingCompoundFactor
                    ),
                    autoRollLog.lendingCompoundFactor,
                    destinationLendingCF
                )
                .toInt256() -
            _balance;
    }

    function _updateCompoundFactor(
        bytes32 _ccy,
        uint256 _unitPrice,
        uint256 _feeRate
    ) private {
        require(_feeRate <= ProtocolTypes.PCT_DIGIT, "Invalid fee rate");

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is:
        // autoRollRate = 1 / unitPrice
        // newLendingCompoundFactor = currentLendingCompoundFactor * (autoRollRate - feeRate)
        // newBorrowingCompoundFactor = currentBorrowingCompoundFactor * (autoRollRate + feeRate)
        Storage.slot().lendingCompoundFactors[_ccy] =
            (Storage.slot().lendingCompoundFactors[_ccy] *
                (ProtocolTypes.PRICE_DIGIT * ProtocolTypes.PCT_DIGIT - _feeRate * _unitPrice)) /
            (ProtocolTypes.PCT_DIGIT * _unitPrice);

        Storage.slot().borrowingCompoundFactors[_ccy] =
            (Storage.slot().borrowingCompoundFactors[_ccy] *
                (ProtocolTypes.PRICE_DIGIT * ProtocolTypes.PCT_DIGIT + _feeRate * _unitPrice)) /
            (ProtocolTypes.PCT_DIGIT * _unitPrice);
    }
}
