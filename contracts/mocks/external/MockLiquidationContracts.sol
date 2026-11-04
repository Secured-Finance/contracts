// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {ILiquidationReceiver} from "../../protocol/interfaces/ILiquidationReceiver.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
import {ISwapExecutor} from "../../external/liquidation/interfaces/ISwapExecutor.sol";

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

contract MockLiquidationSwapExecutor is ISwapExecutor {
    uint256 private constant RATE_PRECISION = 1e18;

    mapping(bytes32 => uint256) public exchangeRates;

    function setExchangeRate(address _tokenIn, address _tokenOut, uint256 _rate) external {
        exchangeRates[keccak256(abi.encode(_tokenIn, _tokenOut))] = _rate;
    }

    function supportsPair(address _tokenIn, address _tokenOut) external view returns (bool) {
        return exchangeRates[keccak256(abi.encode(_tokenIn, _tokenOut))] != 0;
    }

    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _minimumAmountOut,
        address _recipient
    ) external payable returns (uint256 amountOut) {
        require(msg.value == 0, "Native input unsupported");
        uint256 rate = exchangeRates[keccak256(abi.encode(_tokenIn, _tokenOut))];
        require(rate != 0, "Unsupported pair");

        amountOut = (_amountIn * rate) / RATE_PRECISION;
        require(amountOut >= _minimumAmountOut, "Too little received");
        TransferHelper.safeTransferFrom(_tokenIn, msg.sender, address(this), _amountIn);
        TransferHelper.safeTransfer(_tokenOut, _recipient, amountOut);
    }
}

contract MockPermit2 {
    struct Allowance {
        uint160 amount;
        uint48 expiration;
    }

    mapping(address => mapping(address => mapping(address => Allowance))) public allowance;

    function approve(
        address _token,
        address _spender,
        uint160 _amount,
        uint48 _expiration
    ) external {
        allowance[msg.sender][_token][_spender] = Allowance(_amount, _expiration);
    }

    function transferFrom(address _from, address _to, uint160 _amount, address _token) external {
        Allowance storage permitted = allowance[_from][_token][msg.sender];
        require(permitted.expiration >= block.timestamp, "Allowance expired");
        require(permitted.amount >= _amount, "Insufficient allowance");
        permitted.amount -= _amount;
        TransferHelper.safeTransferFrom(_token, _from, _to, _amount);
    }
}

contract MockUniversalRouter {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    uint256 private constant RATE_PRECISION = 1e18;

    MockPermit2 public immutable permit2;
    mapping(bytes32 => uint256) public exchangeRates;

    constructor(address _permit2) {
        permit2 = MockPermit2(_permit2);
    }

    function setExchangeRate(address _tokenIn, address _tokenOut, uint256 _rate) external {
        exchangeRates[keccak256(abi.encode(_tokenIn, _tokenOut))] = _rate;
    }

    function execute(
        bytes calldata _commands,
        bytes[] calldata _inputs,
        uint256 _deadline
    ) external {
        require(_deadline >= block.timestamp, "Transaction too old");
        require(_commands.length == 1 && _inputs.length == 1, "Invalid command count");

        uint8 command = uint8(_commands[0]);
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minimumAmountOut;

        if (command == 0x00) {
            address recipient;
            bytes memory path;
            bool payerIsUser;
            uint256[] memory minHopPriceX36;
            (recipient, amountIn, minimumAmountOut, path, payerIsUser, minHopPriceX36) = abi.decode(
                _inputs[0],
                (address, uint256, uint256, bytes, bool, uint256[])
            );
            require(recipient == msg.sender && payerIsUser, "Invalid V3 parameters");
            require(path.length == 43, "Invalid V3 path");
            require(minHopPriceX36.length == 0, "Invalid V3 hop limits");
            assembly {
                tokenIn := shr(96, mload(add(path, 32)))
                tokenOut := shr(96, mload(add(path, 55)))
            }
        } else if (command == 0x10) {
            bytes memory actions;
            bytes[] memory params;
            (actions, params) = abi.decode(_inputs[0], (bytes, bytes[]));
            require(actions.length == 3 && params.length == 3, "Invalid V4 actions");
            require(
                uint8(actions[0]) == 0x06 && uint8(actions[1]) == 0x0c && uint8(actions[2]) == 0x0f,
                "Invalid V4 action sequence"
            );

            ExactInputSingleParams memory swapParams = abi.decode(
                params[0],
                (ExactInputSingleParams)
            );
            tokenIn = swapParams.zeroForOne
                ? swapParams.poolKey.currency0
                : swapParams.poolKey.currency1;
            tokenOut = swapParams.zeroForOne
                ? swapParams.poolKey.currency1
                : swapParams.poolKey.currency0;
            amountIn = swapParams.amountIn;
            minimumAmountOut = swapParams.amountOutMinimum;
        } else {
            revert("Unsupported command");
        }

        uint256 rate = exchangeRates[keccak256(abi.encode(tokenIn, tokenOut))];
        require(rate != 0, "Unsupported pair");
        uint256 amountOut = (amountIn * rate) / RATE_PRECISION;
        require(amountOut >= minimumAmountOut, "Too little received");

        permit2.transferFrom(msg.sender, address(this), uint160(amountIn), tokenIn);
        TransferHelper.safeTransfer(tokenOut, msg.sender, amountOut);
    }
}
