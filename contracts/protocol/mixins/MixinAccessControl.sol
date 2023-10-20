// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "../utils/AccessControl.sol";

/**
 * @notice Implements functions to add  role-based access control mechanisms.
 */
contract MixinAccessControl is AccessControl {
    error CallerNotOperator();

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /**
     * @dev Throws if called by any account other than the admin.
     */
    modifier onlyOperator() {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert CallerNotOperator();
        _;
    }

    /**
     * @dev Initializes the roles.
     * @param _admin The address of the admin role
     */
    function _setupInitialRoles(address _admin) internal {
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        // _grantRole(PROTOCOL_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
    }

    /**
     * @notice Sets the role as admin of a specific role.
     * @dev By default the admin role for all roles is `DEFAULT_ADMIN_ROLE`.
     * @param role The role to be managed by the admin role
     * @param adminRole The admin role
     */
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }

    /**
     * @notice Adds a new admin as Operator
     * @param admin The address of the new admin
     */
    function addOperator(address admin) external {
        grantRole(OPERATOR_ROLE, admin);
    }

    /**
     * @notice Removes an admin as Operator
     * @param admin The address of the admin to remove
     */
    function removeOperator(address admin) external {
        revokeRole(OPERATOR_ROLE, admin);
    }
}
