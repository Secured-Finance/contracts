// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ICollateralAggregator {
    event Deposit(address indexed addr, uint256 amount);
    event Liquidate(address indexed from, address indexed to, uint256 amount);
    event PositionDeposit(
        address indexed partyA,
        address indexed partyB,
        uint256 amountA,
        uint256 amountB
    );
    event PositionWithdraw(
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
    event Register(address indexed addr, uint256 id, uint256 amount);
    event Release(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );
    event UpdatePV(
        address indexed addr,
        uint256 prevPV,
        uint256 newPV,
        uint8 ccy
    );
    event UpdateState(address indexed addr, uint8 prevState, uint8 currState);
    event UseCollateral(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );
    event Withdraw(address indexed addr, uint256 amount);

    function AUTOLQLEVEL() external view returns (uint256);

    function LQLEVEL() external view returns (uint256);

    function MARGINLEVEL() external view returns (uint256);

    function addCollateralUser(address _user) external returns (bool);

    function currencyController() external view returns (address);

    function deposit() external payable;

    function deposit(address _counterparty) external payable;

    function getCoverage(address party0, address party1)
        external
        view
        returns (uint256, uint256);

    function getExposedCurrencies(address partyA, address partyB) 
        external 
        view 
        returns (bytes32[] memory);

    function isCovered(
        address party0,
        address party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) external view returns (bool, bool);

    function liquidateUnsettled(
        address from,
        address to,
        bytes32 ccy,
        uint256 amount
    ) external;

    function liquidate(
        address from,
        address to,
        bytes32 ccy,
        uint256 amount
    ) external;

    function owner() external view returns (address);

    function rebalanceFrom(
        address _fromParty,
        address _toParty,
        uint256 _amount
    ) external;

    function rebalanceTo(
        address _mainParty,
        address _counterparty,
        uint256 _amount
    ) external;

    function rebalanceTo(address _counterparty, uint256 _amount) external;

    function register() external payable;

    function register(uint256 id) external payable;

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function releaseCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external;

    function removeCollateralUser(address _user) external returns (bool);

    function updateLiquidationPrice(uint256 _price) external;

    function updateLiquidationThreshold(uint256 _ratio) external;

    function updateMarginCallThreshold(uint256 _ratio) external;

    function updatePV(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) external;

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function useCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external;

    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) external;

    function withdraw(uint256 _amt) external;

    function withdrawFrom(address _counterparty, uint256 _amt) external;
}