// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IERC20} from "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";

import {INativeToken} from "../../protocol/interfaces/INativeToken.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
import {Ownable} from "../../protocol/utils/Ownable.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";
import {ISwapExecutor} from "./interfaces/ISwapExecutor.sol";
import {IUniversalRouter} from "./interfaces/IUniversalRouter.sol";

/**
 * @notice Pair-aware swap executor backed by Uniswap Universal Router.
 * @dev Routes are owner-configured and can contain V3 and V4 exact-input hops. Each hop is
 *      executed separately so that mixed V3/V4 routes never expose arbitrary router commands.
 */
contract UniswapUniversalRouterExecutor is ISwapExecutor, Ownable {
    enum Protocol {
        V3,
        V4
    }

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

    struct RouteStep {
        Protocol protocol;
        address tokenOut;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }

    error InvalidAddress(address account);
    error InvalidAmount(uint256 amount);
    error InvalidRoute(address tokenIn, address tokenOut);
    error InvalidRouteStep(uint256 index);
    error InvalidNativeValue(uint256 expected, uint256 actual);
    error InsufficientOutputAmount(uint256 minimumAmountOut, uint256 actualAmountOut);
    error ReentrantCall();

    event RouteUpdated(address indexed tokenIn, address indexed tokenOut, uint256 stepCount);
    event SwapExecuted(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    uint8 private constant UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN = 0x00;
    uint8 private constant UNIVERSAL_ROUTER_V4_SWAP = 0x10;
    uint8 private constant V4_SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 private constant V4_SETTLE_ALL = 0x0c;
    uint8 private constant V4_TAKE_ALL = 0x0f;
    uint256 private constant ROUTER_DEADLINE_BUFFER = 5 minutes;

    IUniversalRouter public immutable universalRouter;
    IPermit2 public immutable permit2;
    address public immutable wrappedNativeToken;

    mapping(bytes32 => RouteStep[]) private routes;
    bool private entered;

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(address _universalRouter, address _permit2, address _wrappedNativeToken) {
        if (_universalRouter.code.length == 0) revert InvalidAddress(_universalRouter);
        if (_permit2.code.length == 0) revert InvalidAddress(_permit2);
        if (_wrappedNativeToken.code.length == 0) revert InvalidAddress(_wrappedNativeToken);

        universalRouter = IUniversalRouter(_universalRouter);
        permit2 = IPermit2(_permit2);
        wrappedNativeToken = _wrappedNativeToken;
        _transferOwnership(msg.sender);
    }

    receive() external payable {}

    function supportsPair(address _tokenIn, address _tokenOut) external view returns (bool) {
        return routes[_routeKey(_tokenIn, _tokenOut)].length != 0;
    }

    function getRoute(
        address _tokenIn,
        address _tokenOut
    ) external view returns (RouteStep[] memory) {
        return routes[_routeKey(_tokenIn, _tokenOut)];
    }

    /**
     * @notice Adds or replaces the route for a token pair.
     */
    function setRoute(
        address _tokenIn,
        address _tokenOut,
        RouteStep[] calldata _steps
    ) external onlyOwner {
        if (
            _tokenIn == address(0) ||
            _tokenOut == address(0) ||
            _tokenIn == _tokenOut ||
            _steps.length == 0
        ) {
            revert InvalidRoute(_tokenIn, _tokenOut);
        }

        bytes32 key = _routeKey(_tokenIn, _tokenOut);
        delete routes[key];

        address currentToken = _tokenIn;
        for (uint256 i; i < _steps.length; i++) {
            RouteStep calldata step = _steps[i];
            if (
                step.tokenOut == address(0) ||
                step.tokenOut == currentToken ||
                (step.protocol == Protocol.V4 && step.tickSpacing <= 0) ||
                (step.protocol == Protocol.V3 &&
                    (step.fee == 0 ||
                        step.tickSpacing != 0 ||
                        step.hooks != address(0) ||
                        step.hookData.length != 0))
            ) {
                revert InvalidRouteStep(i);
            }

            routes[key].push(step);
            currentToken = step.tokenOut;
        }

        if (currentToken != _tokenOut) {
            revert InvalidRoute(_tokenIn, _tokenOut);
        }

        emit RouteUpdated(_tokenIn, _tokenOut, _steps.length);
    }

    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _minimumAmountOut,
        address _recipient
    ) external payable nonReentrant returns (uint256 amountOut) {
        RouteStep[] storage route = routes[_routeKey(_tokenIn, _tokenOut)];
        if (route.length == 0) revert InvalidRoute(_tokenIn, _tokenOut);
        if (_amountIn == 0 || _amountIn > type(uint128).max) revert InvalidAmount(_amountIn);
        if (_minimumAmountOut > type(uint128).max) revert InvalidAmount(_minimumAmountOut);
        if (_recipient == address(0)) revert InvalidAddress(_recipient);

        if (_tokenIn == wrappedNativeToken && msg.value != 0) {
            if (msg.value != _amountIn) revert InvalidNativeValue(_amountIn, msg.value);
            INativeToken(wrappedNativeToken).deposit{value: _amountIn}();
        } else {
            if (msg.value != 0) revert InvalidNativeValue(0, msg.value);
            TransferHelper.safeTransferFrom(_tokenIn, msg.sender, address(this), _amountIn);
        }

        address currentToken = _tokenIn;
        uint256 currentAmount = _amountIn;

        for (uint256 i; i < route.length; i++) {
            RouteStep storage step = route[i];
            uint256 hopMinimumAmountOut = i == route.length - 1 ? _minimumAmountOut : 0;

            _approveRouter(currentToken, currentAmount);
            if (step.protocol == Protocol.V3) {
                currentAmount = _executeV3Swap(
                    currentToken,
                    step.tokenOut,
                    step.fee,
                    currentAmount,
                    hopMinimumAmountOut
                );
            } else {
                currentAmount = _executeV4Swap(
                    currentToken,
                    step,
                    currentAmount,
                    hopMinimumAmountOut
                );
            }
            _revokeRouter(currentToken);
            currentToken = step.tokenOut;
        }

        amountOut = currentAmount;
        if (amountOut < _minimumAmountOut) {
            revert InsufficientOutputAmount(_minimumAmountOut, amountOut);
        }

        if (_tokenOut == wrappedNativeToken) {
            INativeToken(wrappedNativeToken).withdraw(amountOut);
            TransferHelper.safeTransferETH(_recipient, amountOut);
        } else {
            TransferHelper.safeTransfer(_tokenOut, _recipient, amountOut);
        }

        emit SwapExecuted(msg.sender, _tokenIn, _tokenOut, _amountIn, amountOut, _recipient);
    }

    function _executeV3Swap(
        address _tokenIn,
        address _tokenOut,
        uint24 _fee,
        uint256 _amountIn,
        uint256 _minimumAmountOut
    ) private returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(_tokenOut).balanceOf(address(this));
        bytes memory commands = abi.encodePacked(UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(
            address(this),
            _amountIn,
            _minimumAmountOut,
            abi.encodePacked(_tokenIn, _fee, _tokenOut),
            true
        );

        universalRouter.execute(commands, inputs, block.timestamp + ROUTER_DEADLINE_BUFFER);
        amountOut = IERC20(_tokenOut).balanceOf(address(this)) - balanceBefore;
    }

    function _executeV4Swap(
        address _tokenIn,
        RouteStep storage _step,
        uint256 _amountIn,
        uint256 _minimumAmountOut
    ) private returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(_step.tokenOut).balanceOf(address(this));
        bool zeroForOne = _tokenIn < _step.tokenOut;
        PoolKey memory poolKey = PoolKey({
            currency0: zeroForOne ? _tokenIn : _step.tokenOut,
            currency1: zeroForOne ? _step.tokenOut : _tokenIn,
            fee: _step.fee,
            tickSpacing: _step.tickSpacing,
            hooks: _step.hooks
        });

        bytes memory commands = abi.encodePacked(UNIVERSAL_ROUTER_V4_SWAP);
        bytes memory actions = abi.encodePacked(
            V4_SWAP_EXACT_IN_SINGLE,
            V4_SETTLE_ALL,
            V4_TAKE_ALL
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: poolKey,
                zeroForOne: zeroForOne,
                amountIn: uint128(_amountIn),
                amountOutMinimum: uint128(_minimumAmountOut),
                hookData: _step.hookData
            })
        );
        params[1] = abi.encode(_tokenIn, _amountIn);
        params[2] = abi.encode(_step.tokenOut, _minimumAmountOut);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        universalRouter.execute(commands, inputs, block.timestamp + ROUTER_DEADLINE_BUFFER);
        amountOut = IERC20(_step.tokenOut).balanceOf(address(this)) - balanceBefore;
    }

    function _approveRouter(address _token, uint256 _amount) private {
        if (_amount > type(uint160).max) revert InvalidAmount(_amount);
        TransferHelper.safeApprove(_token, address(permit2), _amount);
        permit2.approve(
            _token,
            address(universalRouter),
            uint160(_amount),
            uint48(block.timestamp + ROUTER_DEADLINE_BUFFER)
        );
    }

    function _revokeRouter(address _token) private {
        permit2.approve(_token, address(universalRouter), 0, 0);
        TransferHelper.safeApprove(_token, address(permit2), 0);
    }

    function _routeKey(address _tokenIn, address _tokenOut) private pure returns (bytes32) {
        return keccak256(abi.encode(_tokenIn, _tokenOut));
    }
}
