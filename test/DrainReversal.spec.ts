import { expect } from "chai";
import { JsonRpcSigner } from "@ethersproject/providers";
import { BigNumber, constants, Contract, ContractTransaction } from "ethers";
import { ethers, waffle } from "hardhat";
import { RestrictedIndexPool, IERC20, UniBurn, IIndexPool } from "../typechain";
import {
  restoreDrainedTokens,
  impersonate,
  sendEtherTo,
  treasury,
  withSigner,
  CC10,
  DEFI5,
  FFF,
  CC10_DRAINED_TOKENS,
  bmul,
  bdiv,
  UNISWAP_PAIRS,
  PAIR_BALANCES,
  ALLOWANCE_CHECKS,
  PoolName,
  createSnapshot,
  FFF_DRAINED_TOKENS,
  DEFI5_DRAINED_TOKENS,
  testFixtures,
} from "./shared";
import {
  getPoolData,
  PoolData,
  HOLDERS,
  TokenHolder,
  getBalances,
} from "./data";

describe("Drain Reversal", () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let defi5: RestrictedIndexPool;
  let cc10: RestrictedIndexPool;
  let fff: RestrictedIndexPool;
  let treasurySigner: JsonRpcSigner;
  let uniBurn: UniBurn;
  let weth: IERC20;
  let orcl5: IIndexPool;
  let degen: IIndexPool;

  let OLD_DEFI5_DATA: PoolData;
  let OLD_CC10_DATA: PoolData;
  let OLD_FFF_DATA: PoolData;

  let reset: () => Promise<void>;

  after(async () => await reset());

  before(async () => {
    reset = await createSnapshot();
    ({
      orcl5,
      degen,
      defi5,
      cc10,
      fff,
      weth,
      OLD_DEFI5_DATA,
      OLD_CC10_DATA,
      OLD_FFF_DATA,
      uniBurn,
    } = await testFixtures(true, true));

    await sendEtherTo(treasury);
    await sendEtherTo("0xc46e0e7ecb3efcc417f6f89b940ffaff72556382");
    treasurySigner = await impersonate(treasury);
  });

  const testTokenBalances = (token: string, name: keyof typeof HOLDERS) =>
    describe("Balances", () => {
      const holders: TokenHolder[] = HOLDERS[name];
      let totalSupply: BigNumber;

      before(async () => {
        totalSupply = await ((await ethers.getContractAt(
          "IERC20",
          token
        )) as IERC20).totalSupply();
      });

      it("Only gives holders with >0 balance", async () => {
        for (const holder of holders) {
          expect(holder.balance).to.be.gt(0);
        }
      });

      it("Old balances match current", async () => {
        const accounts = holders.map((h) => h.address);
        const balances = holders.map((h) => h.balance);
        const blockNumber = await ethers.provider.getBlockNumber();
        const tokenBalances = await getBalances(token, accounts, blockNumber);
        const realBalances = accounts.map((account) => tokenBalances[account]);
        expect(balances).to.deep.eq(realBalances);
      });

      it("Sum of balances equals totalSupply", () => {
        const balances = holders.map((h) => h.balance);
        const sum = balances.reduce(
          (sum, balance) => sum.add(balance),
          BigNumber.from(0)
        );
        expect(sum).to.eq(totalSupply);
      });
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

  describe("initialize reverts if all balances not restored", () => {
    it("defi5", async () => {
      await expect(
        defi5.initialize(uniBurn.address, UNISWAP_PAIRS.defi5)
      ).to.be.revertedWith("Balances not reinstated");
    });

    it("cc10", async () => {
      await expect(
        cc10.initialize(uniBurn.address, UNISWAP_PAIRS.cc10)
      ).to.be.revertedWith("Balances not reinstated");
    });

    it("fff", async () => {
      await expect(
        fff.initialize(uniBurn.address, UNISWAP_PAIRS.fff)
      ).to.be.revertedWith("Balances not reinstated");
    });
  });

  const testStorage = (name: PoolName) =>
    describe("Storage values match pre-drain state", async () => {
      let pool: RestrictedIndexPool;
      let oldData: PoolData;

      before(() => {
        switch (name) {
          case "defi5": {
            [pool, oldData] = [defi5, OLD_DEFI5_DATA];
            break;
          }
          case "cc10": {
            [pool, oldData] = [cc10, OLD_CC10_DATA];
            break;
          }
          case "fff": {
            [pool, oldData] = [fff, OLD_FFF_DATA];
            break;
          }
        }
      });

      it("Pool state queries", async () => {
        const tokens = oldData.getCurrentTokens;
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const { balance, denorm } = oldData.records[i];
          expect(await pool.isBound(token)).to.be.true;
          expect(await pool.getDenormalizedWeight(token)).to.eq(denorm);
          expect(await pool.getUsedBalance(token)).to.eq(balance);
        }
        const data = await getPoolData(pool);
        expect(data).to.deep.eq({ ...oldData, getExitFee: "0x00" });
      });

      it("Maintained allowance", async () => {
        const allowanceCheck = ALLOWANCE_CHECKS[name];
        expect(
          await pool.allowance(allowanceCheck[0], allowanceCheck[1])
        ).to.eq(constants.MaxUint256);
      });

      it("Uniswap pair has same balance", async () => {
        expect(await pool.balanceOf(UNISWAP_PAIRS[name])).to.eq(
          PAIR_BALANCES[name]
        );
      });
    });

  describe("DEFI5", () => {
    const oldPairBalance = PAIR_BALANCES.defi5;
    const uniswapPair = UNISWAP_PAIRS.defi5;

    before("Transfer tokens from treasury", async () => {
      await restoreDrainedTokens(defi5, DEFI5_DRAINED_TOKENS, treasurySigner);
    });

    testStorage("defi5");

    testTokenBalances(DEFI5, "DEFI5");

    describe("functions locked before initialization", () => {
      it("transfer", async () => {
        await expect(
          defi5.transfer(constants.AddressZero, 0)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });

      it("transferFrom", async () => {
        await expect(
          defi5.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });

      it("exitPool", async () => {
        await expect(defi5.exitPool(0, [])).to.be.revertedWith(
          "ERR_NOT_INITIALIZED"
        );
      });

      it("exitPoolTo", async () => {
        await expect(
          defi5.exitPoolTo(constants.AddressZero, 0)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });
    });

    describe("initialize", () => {
      before(async () => {
        await defi5.initialize(uniBurn.address, uniswapPair);
      });

      it("Uniswap pair has 0 balance", async () => {
        expect(await defi5.balanceOf(uniswapPair)).to.eq(0);
      });

      it("LP Burn contract has original pair balance", async () => {
        expect(await defi5.balanceOf(uniBurn.address)).to.eq(oldPairBalance);
      });

      it("Pair gets set", async () => {
        expect(await defi5.pair()).to.eq(uniswapPair);
      });

      it("Reverts if already initialized", async () => {
        await expect(
          defi5.initialize(uniBurn.address, uniswapPair)
        ).to.be.revertedWith("ERR_INITIALIZED");
      });
    });

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          defi5.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          defi5.transferFrom(treasury, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          defi5
            .connect(treasurySigner)
            .transferFrom(treasury, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await defi5.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          defi5.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await defi5.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          defi5.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          defi5
            .connect(treasurySigner)
            .transferFrom(treasury, wallet.address, 1)
        ).to.not.emit(defi5, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await defi5
          .connect(treasurySigner)
          .approve(wallet.address, constants.MaxUint256);
        await expect(
          defi5.transferFrom(treasury, wallet.address, 1)
        ).to.not.emit(defi5, "Approval");
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await defi5.connect(treasurySigner).approve(wallet.address, 1);
        await expect(defi5.transferFrom(treasury, wallet.address, 1))
          .to.emit(defi5, "Approval")
          .withArgs(treasury, wallet.address, 0);
        expect(await defi5.allowance(treasury, wallet.address)).to.eq(0);
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await defi5.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          defi5.connect(treasurySigner).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          defi5.connect(treasurySigner).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          defi5.connect(treasurySigner).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        let tx = defi5.connect(treasurySigner).exitPool(amount, amounts);
        await validateBurn(
          tx,
          OLD_DEFI5_DATA,
          defi5,
          treasury,
          treasury,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await defi5.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          defi5.connect(treasurySigner).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        let tx = defi5
          .connect(treasurySigner)
          .exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_DEFI5_DATA,
          defi5,
          treasury,
          wallet.address,
          amount,
          amounts
        );
      });
    });
  });

  describe("CC10", () => {
    const oldPairBalance = PAIR_BALANCES.cc10;
    const uniswapPair = UNISWAP_PAIRS.cc10;

    before("Transfer tokens from treasury", async () => {
      await restoreDrainedTokens(cc10, CC10_DRAINED_TOKENS, treasurySigner);
    });

    testStorage("cc10");

    testTokenBalances(CC10, "CC10");

    describe("functions locked before initialization", () => {
      it("transfer", async () => {
        await expect(
          cc10.transfer(constants.AddressZero, 0)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });

      it("transferFrom", async () => {
        await expect(
          cc10.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });

      it("exitPool", async () => {
        await expect(cc10.exitPool(0, [])).to.be.revertedWith(
          "ERR_NOT_INITIALIZED"
        );
      });

      it("exitPoolTo", async () => {
        await expect(
          cc10.exitPoolTo(constants.AddressZero, 0)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });
    });

    describe("initialize", () => {
      before(async () => {
        await cc10.initialize(uniBurn.address, uniswapPair);
      });

      it("Uniswap pair has 0 balance", async () => {
        expect(await cc10.balanceOf(uniswapPair)).to.eq(0);
      });

      it("LP Burn contract has original pair balance", async () => {
        expect(await cc10.balanceOf(uniBurn.address)).to.eq(oldPairBalance);
      });

      it("Pair gets set", async () => {
        expect(await cc10.pair()).to.eq(uniswapPair);
      });

      it("Reverts if already initialized", async () => {
        await expect(
          cc10.initialize(uniBurn.address, uniswapPair)
        ).to.be.revertedWith("ERR_INITIALIZED");
      });
    });

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          cc10.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          cc10.transferFrom(treasury, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          cc10.connect(treasurySigner).transferFrom(treasury, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await cc10.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          cc10.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await cc10.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          cc10.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          cc10.connect(treasurySigner).transferFrom(treasury, wallet.address, 1)
        ).to.not.emit(cc10, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await cc10
          .connect(treasurySigner)
          .approve(wallet.address, constants.MaxUint256);
        await expect(
          cc10.transferFrom(treasury, wallet.address, 1)
        ).to.not.emit(cc10, "Approval");
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await cc10.connect(treasurySigner).approve(wallet.address, 1);
        await expect(cc10.transferFrom(treasury, wallet.address, 1))
          .to.emit(cc10, "Approval")
          .withArgs(treasury, wallet.address, 0);
        expect(await cc10.allowance(treasury, wallet.address)).to.eq(0);
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await cc10.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          cc10.connect(treasurySigner).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          cc10.connect(treasurySigner).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          cc10.connect(treasurySigner).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        let tx = cc10
          .connect(treasurySigner)
          .exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_CC10_DATA,
          cc10,
          treasury,
          wallet.address,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await cc10.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          cc10.connect(treasurySigner).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        let tx = cc10
          .connect(treasurySigner)
          .exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_CC10_DATA,
          cc10,
          treasury,
          wallet.address,
          amount,
          amounts
        );
      });
    });
  });

  describe("FFF", () => {
    const oldPairBalance = PAIR_BALANCES.fff;
    const uniswapPair = UNISWAP_PAIRS.fff;

    before("Transfer tokens from treasury", async () => {
      await restoreDrainedTokens(fff, FFF_DRAINED_TOKENS, treasurySigner);
    });

    testStorage("fff");

    testTokenBalances(FFF, "FFF");

    it("approve", async () => {
      expect(await fff.allowance(wallet.address, wallet1.address)).to.eq(0);
      await expect(fff.approve(wallet1.address, constants.MaxUint256))
        .to.emit(fff, "Approval")
        .withArgs(wallet.address, wallet1.address, constants.MaxUint256);
      expect(await fff.allowance(wallet.address, wallet1.address)).to.eq(
        constants.MaxUint256
      );
    });

    describe("functions locked before initialization", () => {
      it("transfer", async () => {
        await expect(fff.transfer(constants.AddressZero, 0)).to.be.revertedWith(
          "ERR_NOT_INITIALIZED"
        );
      });

      it("transferFrom", async () => {
        await expect(
          fff.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });

      it("exitPool", async () => {
        await expect(fff.exitPool(0, [])).to.be.revertedWith(
          "ERR_NOT_INITIALIZED"
        );
      });

      it("exitPoolTo", async () => {
        await expect(
          fff.exitPoolTo(constants.AddressZero, 0)
        ).to.be.revertedWith("ERR_NOT_INITIALIZED");
      });
    });

    describe("initialize", () => {
      before(async () => {
        await fff.initialize(uniBurn.address, uniswapPair);
      });

      it("Uniswap pair has 0 balance", async () => {
        expect(await fff.balanceOf(uniswapPair)).to.eq(0);
      });

      it("LP Burn contract has original pair balance", async () => {
        expect(await fff.balanceOf(uniBurn.address)).to.eq(oldPairBalance);
      });

      it("Pair gets set", async () => {
        expect(await fff.pair()).to.eq(uniswapPair);
      });

      it("Reverts if already initialized", async () => {
        await expect(
          fff.initialize(uniBurn.address, uniswapPair)
        ).to.be.revertedWith("ERR_INITIALIZED");
      });
    });

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          fff.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          fff.transferFrom(treasury, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          fff.connect(treasurySigner).transferFrom(treasury, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await fff.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          fff.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSigner(uniswapPair, async (signer) => {
          await fff.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          fff.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          fff.connect(treasurySigner).transferFrom(treasury, wallet.address, 1)
        ).to.not.emit(fff, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await fff
          .connect(treasurySigner)
          .approve(wallet.address, constants.MaxUint256);
        await expect(fff.transferFrom(treasury, wallet.address, 1)).to.not.emit(
          fff,
          "Approval"
        );
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await fff.connect(treasurySigner).approve(wallet.address, 1);
        await expect(fff.transferFrom(treasury, wallet.address, 1))
          .to.emit(fff, "Approval")
          .withArgs(treasury, wallet.address, 0);
        expect(await fff.allowance(treasury, wallet.address)).to.eq(0);
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await fff.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          fff.connect(treasurySigner).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          fff.connect(treasurySigner).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          fff.connect(treasurySigner).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        let tx = fff.connect(treasurySigner).exitPool(amount, amounts);
        await validateBurn(
          tx,
          OLD_FFF_DATA,
          fff,
          treasury,
          treasury,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await fff.connect(treasurySigner).balanceOf(treasury);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          fff.connect(treasurySigner).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        let tx = fff.connect(treasurySigner).exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_FFF_DATA,
          fff,
          treasury,
          wallet.address,
          amount,
          amounts
        );
      });

      it("Works if token balance is 0", async () => {
        await sendEtherTo(fff.address);
        let fffBalance = BigNumber.from(0);
        await withSigner(fff.address, async (signer) => {
          fffBalance = await defi5.balanceOf(fff.address);
          await defi5.connect(signer).transfer(wallet1.address, fffBalance);
        });
        expect(await defi5.balanceOf(FFF)).to.eq(0);
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        let tx = fff.connect(treasurySigner).exitPoolTo(wallet.address, amount);
        await expect(tx)
          .to.emit(fff, "Transfer")
          .withArgs(treasury, constants.AddressZero, amount);
        for (let i = 1; i < amounts.length; i++) {
          const erc20 = await ethers.getContractAt(
            "IERC20",
            OLD_FFF_DATA.getCurrentTokens[i]
          );
          await expect(tx)
            .to.emit(erc20, "Transfer")
            .withArgs(FFF, wallet.address, amounts[i]);
        }
        await defi5.connect(wallet1).transfer(fff.address, fffBalance);
      });
    });
  });

  describe("Undrained Pools", () => {
    it("ORCL5 unaffected by upgrade", async () => {
      await expect(
        orcl5.joinswapExternAmountIn((await orcl5.getCurrentTokens())[0], 0, 0)
      ).to.be.revertedWith("ERR_ZERO_IN");
    });

    it("DEGEN unaffected by upgrade", async () => {
      await expect(
        degen.joinswapExternAmountIn((await degen.getCurrentTokens())[0], 0, 0)
      ).to.be.revertedWith("ERR_ZERO_IN");
    });
  });
});
