// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ICollateralAggregator {
    event Register(address indexed addr);
    event Release(
        address indexed partyA,
        address indexed partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
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

    function register() external;

    function register(
        string[] memory _addresses, 
        uint256[] memory _chainIds
    ) external;

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

    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) external;

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

    function getUsedVaults(address user)
        external
        view
        returns (address[] memory);

    function getUsedVaults(address party0, address party1)
        external
        view
        returns (address[] memory);
}
