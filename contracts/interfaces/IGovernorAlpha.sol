// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;


interface IGovernorAlpha {
  function proposalCount() external view returns (uint256);

  /**
   * @dev The number of votes in support of a proposal required in order for a
   * quorum to be reached and for a vote to succeed
   */
  function quorumVotes() external pure returns (uint256);

  /**
   * @dev The number of votes required in order for a voter to become a proposer
   */
  function proposalThreshold() external pure returns (uint256);

  /**
   * @dev The duration of voting on a proposal, in blocks
   */
  function votingPeriod() external pure returns (uint256);

  /**
   * @param id Unique id for looking up a proposal
   * @param proposer Creator of the proposal
   * @param eta The timestamp that the proposal will be available for execution, set once the vote succeeds
   * @param targets The ordered list of target addresses for calls to be made
   * @param values The ordered list of values (i.e. msg.value) to be passed to the calls to be made
   * @param signatures The ordered list of function signatures to be called
   * @param calldatas The ordered list of calldata to be passed to each call
   * @param startBlock The block at which voting begins: holders must delegate their votes prior to this block
   * @param endBlock The block at which voting ends: votes must be cast prior to this block
   * @param forVotes Current number of votes in favor of this proposal
   * @param againstVotes Current number of votes in opposition to this proposal
   * @param canceled Flag marking whether the proposal has been canceled
   * @param executed Flag marking whether the proposal has been executed
   * @param receipts Receipts of ballots for the entire set of voters
   */
  struct Proposal {
    uint256 id;
    address proposer;
    uint256 eta;
    uint256 startBlock;
    uint256 endBlock;
    uint256 forVotes;
    uint256 againstVotes;
    bool canceled;
    bool executed;
  }

  /**
   * @dev Ballot receipt record for a voter
   * @param hasVoted Whether or not a vote has been cast
   * @param support Whether or not the voter supports the proposal
   * @param votes The number of votes the voter had, which were cast
   */
  struct Receipt {
    bool hasVoted;
    bool support;
    uint96 votes;
  }

  /**
   * @dev Possible states that a proposal may be in
   */
  enum ProposalState {
    Pending,
    Active,
    Canceled,
    Defeated,
    Succeeded,
    Queued,
    Expired,
    Executed
  }

  /**
   * @dev The official record of all proposals ever proposed
   */
  function proposals(uint256 proposalId) external view returns (Proposal memory);

  function propose(
    address[] calldata targets,
    uint256[] calldata values,
    string[] calldata signatures,
    bytes[] calldata calldatas,
    string calldata description
  ) external returns (uint256);

  function queue(uint256 proposalId) external;

  function execute(uint256 proposalId) external payable;

  function cancel(uint256 proposalId) external;

  function getActions(uint256 proposalId)
    external
    view
    returns (
      address[] memory targets,
      uint256[] memory values,
      string[] memory signatures,
      bytes[] memory calldatas
    );

  function getReceipt(uint256 proposalId, address voter) external view returns (Receipt memory);

  function state(uint256 proposalId) external view returns (ProposalState);

  function castVote(uint256 proposalId, bool support) external;
}