// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

interface IMultiTokenStaking {
  struct UserInfo {
    uint256 amount;
    int256 rewardDebt;
  }

  struct PoolInfo {
    uint128 accRewardsPerShare;
    uint64 lastRewardBlock;
    uint64 allocPoint;
  }

  function batch(bytes[] calldata calls, bool revertOnFail)
    external
    payable
    returns (bool[] memory successes, bytes[] memory results);

  /** ==========  Storage  ========== */
  function stakingPoolExists(address) external view returns (bool);

  function poolInfo(uint256) external view returns (PoolInfo memory);

  function userInfo(uint256, address) external view returns (UserInfo memory);

  function lpToken(uint256) external view returns (address);

  function rewarder(uint256) external view returns (address);

  function totalAllocPoint() external view returns (uint256);

  function pointsAllocator() external view returns (address);

  function totalRewardsReceived() external view returns (uint256);

  function poolLength() external view returns (uint256);

  /** ==========  Governance  ========== */
  function setPointsAllocator(address _pointsAllocator) external;

  function transferOwnership(address) external;

  function addRewards(uint256 amount) external;

  function setEarlyEndBlock(uint256 earlyEndBlock) external;

  /** ==========  Pools  ========== */

  function add(
    uint256 _allocPoint,
    address _lpToken,
    address _rewarder
  ) external;

  function set(
    uint256 _pid,
    uint256 _allocPoint,
    address _rewarder,
    bool _overwrite
  ) external;

  function massUpdatePools(uint256[] calldata pids) external;

  function updatePool(uint256 _pid) external returns (PoolInfo memory pool);

  /** ==========  Users  ========== */

  function pendingRewards(uint256 _pid, address _user)
    external
    view
    returns (uint256 pending);

  function deposit(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function withdraw(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function harvest(uint256 _pid, address _to) external;

  function withdrawAndHarvest(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function emergencyWithdraw(uint256 _pid, address _to) external;
}
