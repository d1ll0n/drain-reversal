// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0;
pragma abicoder v2;

interface IMulticall {
  struct Result {
    bool success;
    bytes returnData;
  }
  struct Call {
    address target;
    bytes callData;
  }

  // function aggregate(Call[] calldata calls) external returns (uint256 blockNumber, bytes[] memory returnDatas);
  function tryAggregate(bool requireSuccess, Call[] calldata calls)
    external
    returns (Result[] memory results);
}
