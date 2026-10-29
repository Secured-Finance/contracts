// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {ILiquidationReceiver} from "../../protocol/interfaces/ILiquidationReceiver.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";

contract MockLiquidationTokenVault {
    address public immutable nativeToken;
    mapping(bytes32 => address) public tokenAddresses;
    mapping(address => mapping(bytes32 => uint256)) public depositAmounts;

    constructor(address _nativeToken) {
        nativeToken = _nativeToken;
    }

    function setTokenAddress(bytes32 _ccy, address _token) external {
        tokenAddresses[_ccy] = _token;
    }

    function getTokenAddress(bytes32 _ccy) external view returns (address) {
        return tokenAddresses[_ccy];
    }

    function withdraw(bytes32 _ccy, uint256 _amount) external returns (uint256) {
        TransferHelper.safeTransfer(tokenAddresses[_ccy], msg.sender, _amount);
        return _amount;
    }

    function deposit(bytes32 _ccy, uint256 _amount) external payable {
        address token = tokenAddresses[_ccy];

        if (token == nativeToken) {
            require(msg.value == _amount, "Invalid native amount");
        } else {
            TransferHelper.safeTransferFrom(token, msg.sender, address(this), _amount);
        }

        depositAmounts[msg.sender][_ccy] += _amount;
    }
}

contract MockLiquidationController {
    uint256 public receivedCollateralAmount;
    uint256 public receivedDebtAmount;
    uint256 public unwindCount;

    function setReceivedAmounts(uint256 _collateralAmount, uint256 _debtAmount) external {
        receivedCollateralAmount = _collateralAmount;
        receivedDebtAmount = _debtAmount;
    }

    function getPosition(
        bytes32,
        uint256,
        address
    ) external pure returns (int256 presentValue, int256 futureValue) {
        return (0, 0);
    }

    function unwindPosition(bytes32, uint256) external returns (bool) {
        unwindCount++;
        return true;
    }

    function executeLiquidationCall(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    ) external returns (bool) {
        return _execute(msg.sender, _collateralCcy, _debtCcy, _debtMaturity, _user);
    }

    function executeForcedRepayment(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    ) external returns (bool) {
        return _execute(msg.sender, _collateralCcy, _debtCcy, _debtMaturity, _user);
    }

    function _execute(
        address _liquidator,
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    ) internal returns (bool) {
        ILiquidationReceiver(_liquidator).executeOperationForCollateral(
            _liquidator,
            _user,
            _collateralCcy,
            receivedCollateralAmount
        );
        ILiquidationReceiver(_liquidator).executeOperationForDebt(
            _liquidator,
            _user,
            _collateralCcy,
            receivedCollateralAmount,
            _debtCcy,
            _debtMaturity,
            receivedDebtAmount
        );
        return true;
    }
}

contract MockLiquidationV3Router {
    uint256 private constant RATE_PRECISION = 1e18;

    uint256 public exchangeRate;

    constructor(uint256 _exchangeRate) {
        exchangeRate = _exchangeRate;
    }

    function exactInputSingle(
        ISwapRouter.ExactInputSingleParams calldata _params
    ) external returns (uint256 amountOut) {
        amountOut = (_params.amountIn * exchangeRate) / RATE_PRECISION;
        require(amountOut >= _params.amountOutMinimum, "Too little received");

        TransferHelper.safeTransferFrom(
            _params.tokenIn,
            msg.sender,
            address(this),
            _params.amountIn
        );
        TransferHelper.safeTransfer(_params.tokenOut, _params.recipient, amountOut);
    }
}
