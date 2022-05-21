import { GovernorAlpha, NDX, ProxyManagerAccessControl } from './constants';
import { TreasuryTransfers } from '../data';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { corePoolImplementationID, sigmaPoolImplementationID } from './implementationIDs';
import { JsonRpcSigner } from '@ethersproject/providers';
import { getBigNumber, getContract } from './chain';
import { INdx, IGovernorAlpha } from '../../typechain';
import { ContractTransaction, Wallet } from 'ethers';
import { advanceBlocks, advanceTimeAndBlock } from './time';

type ProposalTransaction = {
  target: string;
  signature: string;
  data: string;
}

export const getProposalTransactions = (
  redistributor: string,
  sigmaPoolImplementation: string,
  corePoolImplementation: string
): ProposalTransaction[] => {
  const transactions: ProposalTransaction[] = [];
  for (const transfer of TreasuryTransfers) {
    transactions.push({
      target: transfer.token,
      signature: "transfer(address,uint256)",
      data: defaultAbiCoder.encode(['address', 'uint256'], [redistributor, transfer.amount])
    })
  }
  transactions.push({
    target: ProxyManagerAccessControl,
    signature: "setImplementationAddressManyToOne(bytes32,address)",
    data: defaultAbiCoder.encode(['bytes32', 'address'], [sigmaPoolImplementationID, sigmaPoolImplementation])
  })
  transactions.push({
    target: ProxyManagerAccessControl,
    signature: "setImplementationAddressManyToOne(bytes32,address)",
    data: defaultAbiCoder.encode(['bytes32', 'address'], [corePoolImplementationID, corePoolImplementation])
  })
  transactions.push({
    target: redistributor,
    signature: "restoreBalances()",
    data: "0x"
  })
  return transactions;
};

export const delegateTreasuryAssets = async (
  treasurySigner: JsonRpcSigner,
  proposer0: Wallet,
  proposer1: Wallet
) => {
  const ndx: INdx = await getContract(NDX, 'INdx')
  await ndx.connect(treasurySigner).transfer(proposer0.address, getBigNumber(400000))
  await ndx.connect(treasurySigner).transfer(proposer1.address, getBigNumber(400000))
  await ndx.connect(proposer0).delegate(proposer0.address)
  await ndx.connect(proposer1).delegate(proposer1.address)
  await advanceTimeAndBlock(30)
}

export const propose = async (
  signer: Wallet,
  transactions: ProposalTransaction[],
  description: string
) => {
  const governor: IGovernorAlpha = await getContract(GovernorAlpha, 'IGovernorAlpha', signer as any)
  await governor.propose(
    transactions.map(t => t.target),
    transactions.map(t => 0),
    transactions.map(t => t.signature),
    transactions.map(t => t.data),
    description
  );
  await advanceTimeAndBlock(30);
  const id = await governor.proposalCount()

  await governor.castVote(id, true);
  return id.toNumber();
}

export const executeProposals = async (ids: number[]): Promise<Promise<ContractTransaction>[]> => {
  const governor: IGovernorAlpha = await getContract(GovernorAlpha, 'IGovernorAlpha')
  await advanceBlocks(17500);
  for (const id of ids) await governor.queue(id);
  await advanceTimeAndBlock(86400 * 3)
  return ids.map(id => governor.execute(id))
}