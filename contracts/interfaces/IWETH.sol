// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "./IERC20.sol";

interface IWETH is IERC20 {
  function deposit() external payable;

  function withdraw(uint256) external;
}
