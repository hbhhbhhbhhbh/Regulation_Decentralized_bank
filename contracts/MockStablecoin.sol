// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockStablecoin
 * @dev 简单的可增发 ERC20，用于本地模拟银行存款资产 (sUSD)。
 */
contract MockStablecoin is ERC20 {
    constructor() ERC20("SafeHarborUSD", "sUSD") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

