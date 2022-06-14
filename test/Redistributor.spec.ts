import { BigNumber, Contract } from "ethers";
import { expect } from "chai";
import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "hardhat";
import {
  RestrictedIndexPool,
  IERC20,
  UniBurn,
  Redistributor,
} from "../typechain";
import {
  DRAIN_BLOCK,
  impersonate,
  sendEtherTo,
  treasury,
  WETH,
  CC10,
  DEFI5,
  CC10_DRAINED_TOKENS,
  UNISWAP_PAIRS,
  createSnapshot,
  testFixtures,
} from "./shared";
import { PoolData, TreasuryTransfers } from "./data";

describe("Redistributor", () => {
  let defi5: RestrictedIndexPool;
  let cc10: RestrictedIndexPool;
  let fff: RestrictedIndexPool;
  let treasurySigner: JsonRpcSigner;
  let uniBurn: UniBurn;
  let weth: IERC20;
  let totalETH: BigNumber;

  let OLD_DEFI5_DATA: PoolData;
  let OLD_CC10_DATA: PoolData;
  let OLD_FFF_DATA: PoolData;

  let redistributor: Redistributor;

  let reset: () => Promise<void>;

  after(async () => await reset());

  before(async () => {
    reset = await createSnapshot();
    ({
      defi5,
      cc10,
      fff,
      weth,
      totalETH,
      OLD_DEFI5_DATA,
      OLD_CC10_DATA,
      OLD_FFF_DATA,
      uniBurn,
      redistributor,
    } = await testFixtures(true, false));
    await sendEtherTo(treasury);
    await sendEtherTo("0xc46e0e7ecb3efcc417f6f89b940ffaff72556382");
    treasurySigner = await impersonate(treasury);

    await sendEtherTo(UNISWAP_PAIRS.defi5);
    await sendEtherTo(UNISWAP_PAIRS.cc10);
    await sendEtherTo(UNISWAP_PAIRS.fff);
  });

  it("Reverts if any call fails", async () => {
    for (const transfer of TreasuryTransfers.slice(0, -1)) {
      const erc20 = new Contract(
        transfer.token,
        weth.interface,
        treasurySigner
      ) as IERC20;
      await erc20.approve(redistributor.address, transfer.amount);
      await expect(redistributor.restoreBalances()).to.be.reverted;
    }
    const lastTransfer = TreasuryTransfers.slice(-1)[0];
    const erc20 = new Contract(
      lastTransfer.token,
      weth.interface,
      treasurySigner
    ) as IERC20;
    await erc20.approve(redistributor.address, lastTransfer.amount);
  });

  const getDrainedTokens = async (
    pool: RestrictedIndexPool,
    oldData: PoolData
  ) => {
    const tokens = oldData.getCurrentTokens;
    const amounts: BigNumber[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const erc20 = (await ethers.getContractAt("IERC20", token)) as IERC20;
      const balance = await erc20.balanceOf(pool.address, {
        blockTag: DRAIN_BLOCK,
      });
      amounts.push(balance);
    }
    return tokens.map((token, i) => ({
      to: pool.address,
      token,
      amount: amounts[i],
    }));
  };

  const getAllDrainedTokens = async () => [
    ...(await getDrainedTokens(fff, {
      ...OLD_FFF_DATA,
      getCurrentTokens: OLD_FFF_DATA.getCurrentTokens.filter(
        (t) => ![DEFI5, CC10].includes(t)
      ),
    })),
    ...(await getDrainedTokens(cc10, {
      ...OLD_CC10_DATA,
      getCurrentTokens: CC10_DRAINED_TOKENS,
    })),
    ...(await getDrainedTokens(defi5, OLD_DEFI5_DATA)),
    {
      to: uniBurn.address,
      amount: totalETH,
      token: WETH,
    },
  ];

  it("Transfers all tokens and initializes all pools", async () => {
    const allTransfers = await getAllDrainedTokens();
    const tx = redistributor.restoreBalances();
    for (const transfer of allTransfers) {
      const erc20 = new Contract(
        transfer.token,
        weth.interface,
        treasurySigner
      ) as IERC20;
      await expect(tx)
        .to.emit(erc20, "Transfer")
        .withArgs(treasury, transfer.to, transfer.amount);
    }
  });
});
