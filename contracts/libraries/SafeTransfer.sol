pragma solidity 0.6.12;

import "../interfaces/IWETH9.sol";

abstract contract SafeTransfer {
    address public immutable WETH9;

    constructor(address _WETH9) public {
        WETH9 = _WETH9;
    }

    receive() external payable {
        require(msg.sender == WETH9, "Not WETH9");
    }

    function _depositAssets(
        address _token,
        address _payer,
        address _receiver,
        uint256 _amount
    ) internal {
        if (address(_token) == WETH9 && address(this).balance >= _amount) {
            _wrapWETH(_receiver, _amount);
        } else if (_receiver == address(this)) {
            _safeTransferFrom(_token, _payer, _amount);
        } else {
            _safeTransferFrom(_token, _payer, _receiver, _amount);
        }
    }

    function _withdrawAssets(
        address _token,
        address _receiver,
        uint256 _amount
    ) internal {
        if (address(_token) == WETH9) {
            _unwrapWETH(_receiver, _amount);
        } else {
            _safeTransfer(_token, _receiver, _amount);
        }
    }

    function _wrapWETH(address _receiver, uint256 _amount) internal {
        _amount = msg.value;

        IWETH9(WETH9).deposit{value: _amount}();
        IWETH9(WETH9).transfer(_receiver, _amount);
    }

    function _unwrapWETH(address _receiver, uint256 _amount) internal {
        uint256 balanceWETH9 = IWETH9(WETH9).balanceOf(address(this));
        require(balanceWETH9 >= _amount, "Insufficient WETH9");

        if (balanceWETH9 > 0) {
            IWETH9(WETH9).withdraw(_amount);
            _safeTransferETH(_receiver, _amount);
        }
    }

    /// @dev Transfer helper from UniswapV2 Router
    function _safeApprove(
        address token,
        address to,
        uint256 value
    ) internal {
        // bytes4(keccak256(bytes('approve(address,uint256)')));
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x095ea7b3, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: APPROVE_FAILED"
        );
    }

    /**
     * There are many non-compliant ERC20 tokens... this can handle most, adapted from UniSwap V2
     * Im trying to make it a habit to put external calls last (reentrancy)
     * You can put this in an internal function if you like.
     */
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal virtual {
        // solium-disable-next-line security/no-low-level-calls
        (bool success, bytes memory data) = token.call(
            // 0xa9059cbb = bytes4(keccak256("transfer(address,uint256)"))
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FROM_FAILED"
        ); // ERC20 Transfer failed
    }

    function _safeTransferFrom(
        address token,
        address from,
        uint256 amount
    ) internal virtual {
        // solium-disable-next-line security/no-low-level-calls
        (bool success, bytes memory data) = token.call(
            // 0x23b872dd = bytes4(keccak256("transferFrom(address,address,uint256)"))
            abi.encodeWithSelector(0x23b872dd, from, address(this), amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FROM_FAILED"
        ); // ERC20 TransferFrom failed
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FROM_FAILED"
        );
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
