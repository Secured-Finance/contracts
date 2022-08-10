// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICollateralAggregatorV3 {
    event Register(address indexed addr);
    event ReleaseUnsettled(address indexed party, bytes32 ccy, uint256 amount);
    event UseUnsettledCollateral(address indexed party, bytes32 ccy, uint256 amount);

    function checkRegisteredUser(address addr) external view returns (bool);

    function getExposedCurrencies(address partyA, address partyB)
        external
        view
        returns (bytes32[] memory);

    function getMaxCollateralBookWidthdraw(address _user)
        external
        view
        returns (uint256 maxWithdraw);

    function getTotalUnsettledExp(address _user) external view returns (uint256);

    function getUnsettledCoverage(address _user) external view returns (uint256 coverage);

    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) external view returns (bool);

    function register() external;

    function register(string[] memory _addresses, uint256[] memory _chainIds) external;

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256);
}
