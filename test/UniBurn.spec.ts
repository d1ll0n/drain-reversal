import { expect } from "chai";
import { JsonRpcSigner } from "@ethersproject/providers";
import { BigNumber, constants, Contract, ContractTransaction } from "ethers";
import { ethers, waffle } from "hardhat";
import { RestrictedIndexPool, IERC20, UniBurn } from "../typechain";
import {
  createBalanceCheckpoint,
  sendEtherTo,
  withSigner,
  bmul,
  bdiv,
  UNISWAP_PAIRS,
  PoolName,
  restoreDrainedTokens,
  DEFI5_DRAINED_TOKENS,
  CC10_DRAINED_TOKENS,
  FFF_DRAINED_TOKENS,
  testFixtures,
} from "./shared";
import { PoolData, PairData, PairState } from "./data";

describe("UniBurn", () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let defi5: RestrictedIndexPool;
  let cc10: RestrictedIndexPool;
  let fff: RestrictedIndexPool;
  let defi5LP: IERC20;
  let cc10LP: IERC20;
  let fffLP: IERC20;
  let treasurySigner: JsonRpcSigner;
  let uniBurn: UniBurn;
  let weth: IERC20;
  let lpStates: Record<PoolName, PairState>;
  let pairDatas: Record<PoolName, PairData>;
  let totalETH: BigNumber;

  let OLD_DEFI5_DATA: PoolData;
  let OLD_CC10_DATA: PoolData;
  let OLD_FFF_DATA: PoolData;

  let reset: () => Promise<void>;

  after(async () => await reset());

  before(async () => {
    ({
      defi5,
      cc10,
      defi5LP,
      cc10LP,
      fffLP,
      fff,
      weth,
      totalETH,
      OLD_DEFI5_DATA,
      OLD_CC10_DATA,
      OLD_FFF_DATA,
      uniBurn,
      lpStates,
      pairDatas,
    } = await testFixtures(true, true));

    await sendEtherTo(UNISWAP_PAIRS.defi5);
    await sendEtherTo(UNISWAP_PAIRS.cc10);
    await sendEtherTo(UNISWAP_PAIRS.fff);
    await restoreDrainedTokens(defi5, DEFI5_DRAINED_TOKENS, treasurySigner);
    await restoreDrainedTokens(cc10, CC10_DRAINED_TOKENS, treasurySigner);
    await restoreDrainedTokens(fff, FFF_DRAINED_TOKENS, treasurySigner);
    await defi5.initialize(uniBurn.address, pairDatas.defi5.address);
    await cc10.initialize(uniBurn.address, pairDatas.cc10.address);
    await fff.initialize(uniBurn.address, pairDatas.fff.address);
  });

  const getAmountsOut = async (
    pool: RestrictedIndexPool,
    poolAmount: BigNumber
  ) => {
    const ratio = bdiv(poolAmount, await pool.totalSupply());
    const tokens = await pool.getCurrentTokens();
    const amounts: BigNumber[] = [];
    for (const token of tokens) {
      const balance = await pool.getBalance(token);
      const amount = bmul(ratio, balance);
      amounts.push(amount);
    }
    return amounts;
  };

  const validateBurn = async (
    tx: Promise<ContractTransaction>,
    poolData: PoolData,
    pool: RestrictedIndexPool,
    sender: string,
    recipient: string,
    poolAmount: BigNumber,
    tokenAmounts: BigNumber[]
  ) => {
    await expect(tx)
      .to.emit(pool, "Transfer")
      .withArgs(sender, constants.AddressZero, poolAmount);
    for (let i = 0; i < tokenAmounts.length; i++) {
      const erc20 = new Contract(
        poolData.getCurrentTokens[i],
        weth.interface,
        ethers.provider
      );
      await expect(tx)
        .to.emit(erc20, "Transfer")
        .withArgs(pool.address, recipient, tokenAmounts[i]);
    }
  };

  const checkData = async (name: PoolName) => {
    const { supply, ethBalance, poolBalance } = await uniBurn[`${name}Data`]();
    expect(supply).to.eq(lpStates[name].supply);
    expect(ethBalance).to.eq(lpStates[name].ethBalance);
    expect(poolBalance).to.eq(lpStates[name].poolBalance);
  };

  describe("UniBurn", () => {
    it("burnWETH", async () => {
      await uniBurn.burnWETH();
      expect(await weth.balanceOf(uniBurn.address)).to.eq(0);
      expect(await ethers.provider.getBalance(uniBurn.address)).to.eq(totalETH);
    });

    it("fffData", async () => {
      await checkData("fff");
    });

    it("defi5Data", async () => {
      await checkData("defi5");
    });

    it("cc10Data", async () => {
      await checkData("cc10");
    });

    describe("redeemFFFLP", () => {
      before(async () => {
        await withSigner(
          "0xc46e0e7ecb3efcc417f6f89b940ffaff72556382",
          async (signer) => {
            await fffLP
              .connect(signer)
              .transfer(wallet.address, await fffLP.balanceOf(signer._address));
          }
        );
      });

      it("Reverts if user balance is 0", async () => {
        await expect(uniBurn.connect(wallet1).redeemFFFLP()).to.be.revertedWith(
          "ERR_NULL_AMOUNT"
        );
      });

      it("Should revert if insufficient approval", async () => {
        await expect(uniBurn.redeemFFFLP()).to.be.revertedWith("TH:STF");
      });

      it("Burns LP and redeems underlying tokens and eth", async () => {
        const lpBalance = await fffLP.balanceOf(wallet.address);
        await fffLP.approve(uniBurn.address, lpBalance);
        const getEthChange = await createBalanceCheckpoint(
          null,
          wallet.address
        );
        const { ethAmount, poolAmount } = lpStates.fff.getAmountsOut(lpBalance);
        const underlyingAmounts = await getAmountsOut(fff, poolAmount);
        expect(ethAmount).to.be.gt(0);
        expect(poolAmount).to.be.gt(0);
        const tx = uniBurn.redeemFFFLP();
        await expect(tx)
          .to.emit(fffLP, "Transfer")
          .withArgs(wallet.address, constants.AddressZero, lpBalance);
        await validateBurn(
          tx,
          OLD_FFF_DATA,
          fff,
          uniBurn.address,
          wallet.address,
          poolAmount,
          underlyingAmounts
        );
        expect(await getEthChange(tx)).to.eq(ethAmount);
      });

      it("Should update internal pool state", async () => {
        await checkData("fff");
      });
    });

    describe("redeemDEFI5LP", () => {
      before(async () => {
        await withSigner(
          "0xc46e0e7ecb3efcc417f6f89b940ffaff72556382",
          async (signer) => {
            await defi5LP
              .connect(signer)
              .transfer(
                wallet.address,
                await defi5LP.balanceOf(signer._address)
              );
          }
        );
      });

      it("Reverts if user balance is 0", async () => {
        await expect(
          uniBurn.connect(wallet1).redeemDEFI5LP()
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Should revert if insufficient approval", async () => {
        await expect(uniBurn.redeemDEFI5LP()).to.be.revertedWith("TH:STF");
      });

      it("Burns LP and redeems underlying tokens and eth", async () => {
        const lpBalance = await defi5LP.balanceOf(wallet.address);
        await defi5LP.approve(uniBurn.address, lpBalance);
        const getEthChange = await createBalanceCheckpoint(
          null,
          wallet.address
        );
        const { ethAmount, poolAmount } = lpStates.defi5.getAmountsOut(
          lpBalance
        );
        const underlyingAmounts = await getAmountsOut(defi5, poolAmount);
        expect(ethAmount).to.be.gt(0);
        expect(poolAmount).to.be.gt(0);
        const tx = uniBurn.redeemDEFI5LP();
        await expect(tx)
          .to.emit(defi5LP, "Transfer")
          .withArgs(wallet.address, constants.AddressZero, lpBalance);
        await validateBurn(
          tx,
          OLD_DEFI5_DATA,
          defi5,
          uniBurn.address,
          wallet.address,
          poolAmount,
          underlyingAmounts
        );
        expect(await getEthChange(tx)).to.eq(ethAmount);
      });

      it("Should update internal pool state", async () => {
        await checkData("defi5");
      });
    });

    describe("redeemCC10LP", () => {
      before(async () => {
        await withSigner(
          "0xc46e0e7ecb3efcc417f6f89b940ffaff72556382",
          async (signer) => {
            await cc10LP
              .connect(signer)
              .transfer(
                wallet.address,
                await cc10LP.balanceOf(signer._address)
              );
          }
        );
      });

      it("Reverts if user balance is 0", async () => {
        await expect(
          uniBurn.connect(wallet1).redeemCC10LP()
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Should revert if insufficient approval", async () => {
        await expect(uniBurn.redeemCC10LP()).to.be.revertedWith("TH:STF");
      });

      it("Burns LP and redeems underlying tokens and eth", async () => {
        const lpBalance = await cc10LP.balanceOf(wallet.address);
        await cc10LP.approve(uniBurn.address, lpBalance);
        const getEthChange = await createBalanceCheckpoint(
          null,
          wallet.address
        );
        const { ethAmount, poolAmount } = lpStates.cc10.getAmountsOut(
          lpBalance
        );
        const underlyingAmounts = await getAmountsOut(cc10, poolAmount);
        expect(ethAmount).to.be.gt(0);
        expect(poolAmount).to.be.gt(0);
        const tx = uniBurn.redeemCC10LP();
        await expect(tx)
          .to.emit(cc10LP, "Transfer")
          .withArgs(wallet.address, constants.AddressZero, lpBalance);
        await validateBurn(
          tx,
          OLD_CC10_DATA,
          cc10,
          uniBurn.address,
          wallet.address,
          poolAmount,
          underlyingAmounts
        );
        expect(await getEthChange(tx)).to.eq(ethAmount);
      });

      it("Should update internal pool state", async () => {
        await checkData("cc10");
      });
    });
  });
});
