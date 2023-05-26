// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMockERC20} from "./IMockERC20.sol";

contract TokenFaucet is Ownable {
    uint256 private constant MAX_MINT_COUNT = 100; // maximum mintable number of times
    uint256 private constant PERIOD = 7200; // how many blocks before limit resets

    struct Counter {
        uint256 total; // total mint count
        bool current; // mint status flag for the current period
        uint256 currentPeriodEnd; // block which the current period ends at
    }

    mapping(bytes32 => address) currencies; // mintable currency
    mapping(bytes32 => uint256) amountPerMint; // amount per mint by currency
    mapping(address => mapping(bytes32 => Counter)) mintCount; // currency mint status counter per user

    function getCurrencyAddress(bytes32 _ccy) external view returns (address) {
        return currencies[_ccy];
    }

    function registerCurrency(
        bytes32 _ccy,
        address _token,
        uint256 _amountPerMint
    ) external {
        currencies[_ccy] = _token;
        amountPerMint[_ccy] = _amountPerMint;
    }

    function mint(bytes32 _ccy) public {
        // initialize Counter per user at the first mint
        if (mintCount[msg.sender][_ccy].total == 0) {
            mintCount[msg.sender][_ccy].current = true;
            mintCount[msg.sender][_ccy].currentPeriodEnd = block.number + PERIOD;
        }
        updatePeriod(_ccy);

        require(mintCount[msg.sender][_ccy].current == true, "Exceeds daily limit");
        require(mintCount[msg.sender][_ccy].total < MAX_MINT_COUNT, "Exceeds max mint limit");
        mintCount[msg.sender][_ccy].current = false;
        mintCount[msg.sender][_ccy].total++;
        address tokenAddress = currencies[_ccy];
        IMockERC20(tokenAddress).mint(msg.sender, amountPerMint[_ccy]);
    }

    function updatePeriod(bytes32 _ccy) internal {
        if (mintCount[msg.sender][_ccy].currentPeriodEnd < block.number) {
            mintCount[msg.sender][_ccy].currentPeriodEnd = block.number + PERIOD;
            mintCount[msg.sender][_ccy].current = true;
        }
    }
}
