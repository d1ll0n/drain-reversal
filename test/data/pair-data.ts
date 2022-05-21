import { BigNumber } from "ethers"
import { ethers } from "hardhat";
import { IERC20, RestrictedIndexPool } from "../../typechain";
import { computeUniswapPairAddress, DRAIN_BLOCK, getContract, PoolName, WETH } from "../shared";

export type PairState = {
  ethBalance: BigNumber;
  poolBalance: BigNumber;
  supply: BigNumber;
  getAmountsOut: (lpAmount: BigNumber) => { ethAmount: BigNumber; poolAmount: BigNumber; };
}

export type PairData = {
  address: string;
  originalBalanceETH: string;
  originalBalancePool: string;
  originalSupply: string;
}

export const getPairData = async (pool: RestrictedIndexPool) => {
  const pair = await ethers.getContractAt('IERC20', computeUniswapPairAddress(pool.address, WETH)) as IERC20;
  const weth: IERC20 = await getContract(WETH, 'IERC20');
  const originalBalanceETH = await (await weth.balanceOf(pair.address, { blockTag: DRAIN_BLOCK })).sub(1)
  const originalBalancePool = await pool.balanceOf(pair.address, { blockTag: DRAIN_BLOCK })
  const originalSupply = await pair.totalSupply({ blockTag: DRAIN_BLOCK })
  const state: any = {
    ethBalance: originalBalanceETH,
    poolBalance: originalBalancePool,
    supply: originalSupply,
  }
  const getAmountsOut = (amount: BigNumber) => {
    const { supply, ethBalance, poolBalance } = state;
    const poolAmount = amount.mul(poolBalance).div(supply)
    const ethAmount = amount.mul(ethBalance).div(supply)
    state.poolBalance = poolBalance.sub(poolAmount)
    state.ethBalance = ethBalance.sub(ethAmount)
    state.supply = supply.sub(amount)
    return {
      ethAmount,
      poolAmount,
    }
  }
  state.getAmountsOut = getAmountsOut;
  return {
    address: pair.address,
    originalBalanceETH: originalBalanceETH.toHexString(),
    originalBalancePool: originalBalancePool.toHexString(),
    originalSupply: originalSupply.toHexString(),
    state: state as PairState
  };
}

export const getAllPairData = async (
  defi5: RestrictedIndexPool,
  cc10: RestrictedIndexPool,
  fff: RestrictedIndexPool
): Promise<{
  lpStates: Record<PoolName, PairState>,
  pairDatas: Record<PoolName, PairData>,
  totalETH: BigNumber
}> => {
  const { state: defi5State, ...defi5LPData } = await getPairData(defi5);
  const { state: cc10State, ...cc10LPData } = await getPairData(cc10);
  const { state: fffState, ...fffLPData } = await getPairData(fff);

  const pairDatas = {
    defi5: defi5LPData,
    cc10: cc10LPData,
    fff: fffLPData,
  };

  const lpStates = {
    defi5: defi5State,
    cc10: cc10State,
    fff: fffState,
  };

  const totalETH = Object.values(lpStates).reduce(
    (total, { ethBalance }) => total.add(ethBalance),
    BigNumber.from(0)
  )

  return {
    pairDatas,
    lpStates,
    totalETH,
  };
}