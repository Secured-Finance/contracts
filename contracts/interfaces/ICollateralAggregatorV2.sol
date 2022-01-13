// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface ICollateralAggregator {
    event CollateralUserAdded(address indexed user);
    event CollateralUserRemoved(address indexed user);
    event CollateralVaultLinked(
        address indexed vault,
        bytes32 ccy,
        address tokenAddress
    );
    event CollateralVaultRemoved(
        address indexed vault,
        bytes32 ccy,
        address tokenAddress
    );
    event CurrencyControllerUpdated(address indexed controller);
    event LiquidationEngineUpdated(address indexed liquidations);
    event LiquidationPriceUpdated(uint256 previousPrice, uint256 price);
    event LiquidationThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MarginCallThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MinCollateralRatioUpdated(uint256 previousRatio, uint256 price);
    event Register(address indexed addr, uint256 id, uint256 amount);
    event Release(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );
    event ReleaseUnsettled(address indexed party, bytes32 ccy, uint256 amount);
    event SettleCollateral(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    );
    event UpdatePV(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    );
    event UseCollateral(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    );
    event UseUnsettledCollateral(
        address indexed party,
        bytes32 ccy,
        uint256 amount
    );

    function liquidationEngine() external view returns (address);
    function currencyController() external view returns (address);

    function AUTOLQLEVEL() external view returns (uint256);
    function LQLEVEL() external view returns (uint256);
    function MARGINLEVEL() external view returns (uint256);
    function MIN_COLLATERAL_RATIO() external view returns (uint256);

    function addCollateralUser(address _user) external returns (bool);
    function isCollateralUser(address _user) external view returns (bool);

    function isCollateralVault(address _vault) external view returns (bool);

    function checkRegisteredUser(address addr) external view returns (bool);

    function enterVault(address _user) external;
    function enterVault(address _party0, address _party1) external;
    function exitVault(address _user) external;
    function exitVault(address _party0, address _party1) external;

    function getCcyExposures(
        address partyA,
        address partyB,
        bytes32 ccy
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function getCoverage(address _party0, address _party1)
        external
        view
        returns (uint256, uint256);

    function getExposedCurrencies(address partyA, address partyB)
        external
        view
        returns (bytes32[] memory);

    function getMaxCollateralBookWidthdraw(address _user)
        external
        view
        returns (uint256 maxWithdraw);

    function getMaxCollateralWidthdraw(address _party0, address _party1)
        external
        view
        returns (uint256, uint256);

    function getNetAndTotalPV(address _party0, address _party1)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function getRebalanceCollateralAmounts(address _party0, address _party1)
        external
        view
        returns (uint256, uint256);

    function getTotalUnsettledExp(address _user)
        external
        view
        returns (uint256);

    function getUnsettledCoverage(address _user)
        external
        view
        returns (uint256 coverage);

    function isCovered(
        address _party0,
        address _party1,
        bytes32 _ccy,
        uint256 _party0PV,
        uint256 _party1PV,
        bool _isSettled
    ) external view returns (bool, bool);

    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) external view returns (bool);

    function linkCollateralVault(address _vault) external returns (bool);

    function liquidate(
        address from,
        address to,
        uint256 liquidationInETH
    ) external;

    function liquidate(
        address from,
        address to,
        bytes32 ccy,
        uint256 liquidationAmount,
        bool isSettled
    ) external;

    function owner() external view returns (address);
    function register() external payable;
    function register(uint256 id) external payable;

    function releaseCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external;

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function removeCollateralUser(address _user) external returns (bool);

    function removeCollateralVault(address _vault) external returns (bool);

    function setCurrencyControler(address _addr) external;

    function setLiquidationEngine(address _addr) external;

    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) external;

    function updateLiquidationPrice(uint256 _price) external;

    function updateLiquidationThreshold(uint256 _ratio) external;

    function updateMarginCallThreshold(uint256 _ratio) external;

    function updateMinCollateralRatio(uint256 _ratio) external;

    function updatePV(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) external;

    function useCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) external;

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;
}