// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {MaturityRate} from "../storages/GenesisValueTokenStorage.sol";

/**
 * @title IGenesisValueToken is a common interface for GenesisValueToken
 */
interface IGenesisValueToken {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, int256 value);
    event CompoundFactorUpdated(uint256 maturity, uint256 rate);

    function compoundFactor() external view returns (uint256);

    function compoundFactorOf(uint256 maturity) external view returns (uint256);

    function futureValueOf(uint256 maturity, int256 futureValueInMaturity)
        external
        view
        returns (int256);

    function updateCompoundFactor(
        uint256 maturity,
        uint256 nextMaturity,
        uint256 rate
    ) external;

    function balanceOf(address account) external view returns (int256);

    function mint(
        address _account,
        uint256 _basisMaturity,
        int256 _futureValue
    ) external returns (bool);
}
