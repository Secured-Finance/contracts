// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.19;
import {ERC20} from "../../dependencies/openzeppelin/token/ERC20/ERC20.sol";
import {AccessControl} from "../../dependencies/openzeppelin/access/AccessControl.sol";
import {IMockERC20} from "./IMockERC20.sol";

contract MockERC20 is IMockERC20, ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, _msgSender()), "Must have minter role");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Must have admin role");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialBalance
    ) payable ERC20(name, symbol) {
        _mint(msg.sender, initialBalance);
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
    }

    function mint(address account, uint256 amount) external override onlyMinter {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external override onlyMinter {
        _burn(account, amount);
    }

    function setMinterRole(address account) external override onlyAdmin {
        _grantRole(MINTER_ROLE, account);
    }

    function removeMinterRole(address account) external override onlyAdmin {
        _revokeRole(MINTER_ROLE, account);
    }
}
