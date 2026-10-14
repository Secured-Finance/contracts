// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";

contract OrderBookIncidentFillRecoveryTokenVaultMock {
    bool public paused = true;
    uint256 public pauseCount;
    uint256 public unpauseCount;

    mapping(bytes32 ccy => mapping(address user => uint256 amount)) private depositAmounts;

    function setPaused(bool _paused) external {
        paused = _paused;
    }

    function setDepositAmount(bytes32 _ccy, address _user, uint256 _amount) external {
        depositAmounts[_ccy][_user] = _amount;
    }

    function getDepositAmount(address _user, bytes32 _ccy) external view returns (uint256) {
        return depositAmounts[_ccy][_user];
    }

    function pause() external {
        paused = true;
        ++pauseCount;
    }

    function unpause() external {
        paused = false;
        ++unpauseCount;
    }
}

contract OrderBookIncidentFillRecoveryControllerMock {
    OrderBookIncidentFillRecoveryTokenVaultMock public immutable tokenVault;

    uint256 public reversalCount;
    uint48 public lastOrderId;
    bool public shouldRevert;

    mapping(bytes32 ccy => mapping(uint256 maturity => mapping(address user => int256 amount)))
        private futureValues;

    constructor(address _tokenVault) {
        tokenVault = OrderBookIncidentFillRecoveryTokenVaultMock(_tokenVault);
    }

    function setFutureValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        int256 _amount
    ) external {
        futureValues[_ccy][_maturity][_user] = _amount;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function getPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external view returns (int256 presentValue, int256 futureValue) {
        return (0, futureValues[_ccy][_maturity][_user]);
    }

    function reverseIncidentOrderFill(
        ILendingMarketController.IncidentOrderFill calldata _fill
    ) external {
        require(!tokenVault.paused(), "TokenVault is paused");

        ++reversalCount;
        lastOrderId = _fill.orderId;
        if (shouldRevert) revert("correction failed");
    }
}
