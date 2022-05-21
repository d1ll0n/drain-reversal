// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;
import "./IERC20.sol";

interface INdx is IERC20 {
  function delegate(address) external;
}