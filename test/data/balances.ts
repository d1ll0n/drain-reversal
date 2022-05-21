import { BigNumber } from 'ethers';
import { ethers } from 'hardhat'
import { IERC20 } from "../../typechain";
import { Call, multicall, getContract } from "../shared";

export async function getBalances(token: string, accounts: string[], block: number) {
  const tokenContract = await getContract(token, 'IERC20') as IERC20;
  const balanceCalls: Call[] = accounts.map(account => ({
    target: token,
    function: 'balanceOf',
    args: [account],
    interface: tokenContract.interface
  }));
  const balanceData = await multicall(ethers.provider, balanceCalls, undefined, block);
  const userBalances = accounts.reduce((obj, account, i) => ({ ...obj, [account]: balanceData[i] }), {} as Record<string, BigNumber>);
  return userBalances;
}