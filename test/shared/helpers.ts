import { ethers } from "hardhat"
import { JsonRpcSigner } from '@ethersproject/providers'
import { IERC20, RestrictedIndexPool } from "../../typechain"
import { PoolData } from "../data"
import { DRAIN_BLOCK } from "./constants"

export const restoreDrainedTokens = async (pool: RestrictedIndexPool, tokens: string[], treasurySigner: JsonRpcSigner) => {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const erc20 = (await ethers.getContractAt('IERC20', token)) as IERC20
    const balance = await erc20.balanceOf(pool.address, { blockTag: DRAIN_BLOCK })
    await erc20.connect(treasurySigner).transfer(pool.address, balance)
  }
}