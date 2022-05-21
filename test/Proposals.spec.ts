import { BigNumber, constants, Contract, ContractTransaction } from "ethers";
import { ethers, waffle } from "hardhat";
import {
  RestrictedIndexPool,
  SigmaFallThrough,
  CoreFallThrough,
  IERC20,
  UniBurn,
  IIndexPool,
  Redistributor,
} from "../typechain";
import {
  createBalanceCheckpoint,
  DRAIN_BLOCK,
  sendEtherTo,
  treasury,
  WETH,
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
  withSignerAndGasMoney,
  testFixtures,
  delegateTreasuryAssets,
  executeProposals,
  getProposalTransactions,
  propose,
} from "./shared";
import {
  getPoolData,
  PoolData,
  HOLDERS,
  TokenHolder,
  getBalances,
  TreasuryTransfers,
  PairState,
} from "./data";

import { expect } from "chai";
import { getAddress } from "ethers/lib/utils";

describe("Redistributor", () => {
  const [wallet, wallet1, tokenHolder] = waffle.provider.getWallets();
  let defi5: RestrictedIndexPool;
  let cc10: RestrictedIndexPool;
  let fff: RestrictedIndexPool;
  let defi5LP: IERC20;
  let cc10LP: IERC20;
  let fffLP: IERC20;
  let sigmaFallthrough: SigmaFallThrough;
  let coreFallthrough: CoreFallThrough;
  let uniBurn: UniBurn;
  let weth: IERC20;
  let orcl5: IIndexPool;
  let degen: IIndexPool;
  let lpStates: Record<PoolName, PairState>;
  let totalETH: BigNumber;

  let OLD_DEFI5_DATA: PoolData;
  let OLD_CC10_DATA: PoolData;
  let OLD_FFF_DATA: PoolData;

  let redistributor: Redistributor;

  let tx0: Promise<ContractTransaction>;
  let tx1: Promise<ContractTransaction>;

  let reset: () => Promise<void>;

  after(async () => await reset());

  before(async () => {
    reset = await createSnapshot();
    ({
      orcl5,
      degen,
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
      sigmaFallthrough,
      coreFallthrough,
    } = await testFixtures());

    await withSignerAndGasMoney(treasury, async (treasurySigner) => {
      await delegateTreasuryAssets(treasurySigner, wallet, wallet1);
    });

    const proposalTransactions = getProposalTransactions(
      redistributor.address,
      sigmaFallthrough.address,
      coreFallthrough.address
    );
    const id0 = await propose(
      wallet,
      proposalTransactions.slice(0, 10),
      "Test Proposal 1"
    );
    const id1 = await propose(
      wallet1,
      proposalTransactions.slice(10),
      "Test Proposal 2"
    );
    [tx0, tx1] = await executeProposals([id0, id1]);
    await withSignerAndGasMoney(treasury, async (treasurySigner) => {
      await defi5
        .connect(treasurySigner)
        .transfer(tokenHolder.address, await defi5.balanceOf(treasury));
      await cc10
        .connect(treasurySigner)
        .transfer(tokenHolder.address, await cc10.balanceOf(treasury));
      await fff
        .connect(treasurySigner)
        .transfer(tokenHolder.address, await fff.balanceOf(treasury));
    });
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
        const unchangedHolders = holders.filter(
          (holder) =>
            ![UNISWAP_PAIRS[name.toLowerCase() as PoolName], treasury].includes(
              getAddress(holder.address)
            )
        );
        const accounts = unchangedHolders.map((h) => h.address);
        const balances = unchangedHolders.map((h) => h.balance);
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

  const checkData = async (name: PoolName) => {
    const { supply, ethBalance, poolBalance } = await uniBurn[`${name}Data`]();
    expect(supply).to.eq(lpStates[name].supply);
    expect(ethBalance).to.eq(lpStates[name].ethBalance);
    expect(poolBalance).to.eq(lpStates[name].poolBalance);
  };

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

      it("UniBurn has pair balance", async () => {
        expect(await pool.balanceOf(uniBurn.address)).to.eq(
          PAIR_BALANCES[name]
        );
      });
    });

  describe("First Proposal", () => {
    it("Treasury transfers first 10 tokens", async () => {
      for (const transfer of TreasuryTransfers.slice(0, 10)) {
        const erc20 = new Contract(
          transfer.token,
          defi5LP.interface,
          ethers.provider
        ) as IERC20;
        await expect(tx0)
          .to.emit(erc20, "Transfer")
          .withArgs(treasury, redistributor.address, transfer.amount);
      }
    });
  });

  describe("Second Proposal", () => {
    it("Treasury transfers remaining tokens", async () => {
      for (const transfer of TreasuryTransfers.slice(10)) {
        const erc20 = new Contract(
          transfer.token,
          defi5LP.interface,
          ethers.provider
        ) as IERC20;
        await expect(tx1)
          .to.emit(erc20, "Transfer")
          .withArgs(treasury, redistributor.address, transfer.amount);
      }
    });

    it("Redistributor transfers all tokens and initializes all pools", async () => {
      const allTransfers = await getAllDrainedTokens();
      for (const transfer of allTransfers) {
        const erc20 = new Contract(
          transfer.token,
          defi5LP.interface,
          ethers.provider
        ) as IERC20;
        await expect(tx1)
          .to.emit(erc20, "Transfer")
          .withArgs(redistributor.address, transfer.to, transfer.amount);
      }
    });
  });

  describe("DEFI5", () => {
    const oldPairBalance = PAIR_BALANCES.defi5;
    const uniswapPair = UNISWAP_PAIRS.defi5;

    testStorage("defi5");

    testTokenBalances(DEFI5, "DEFI5");

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          defi5.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          defi5.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          defi5
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await defi5.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          defi5.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await defi5.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          defi5.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          defi5
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(defi5, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await defi5
          .connect(tokenHolder)
          .approve(wallet.address, constants.MaxUint256);
        await expect(
          defi5.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(defi5, "Approval");
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await defi5.connect(tokenHolder).approve(wallet.address, 1);
        await expect(defi5.transferFrom(tokenHolder.address, wallet.address, 1))
          .to.emit(defi5, "Approval")
          .withArgs(tokenHolder.address, wallet.address, 0);
        expect(
          await defi5.allowance(tokenHolder.address, wallet.address)
        ).to.eq(0);
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await defi5
          .connect(tokenHolder)
          .balanceOf(tokenHolder.address);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          defi5.connect(tokenHolder).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          defi5.connect(tokenHolder).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          defi5.connect(tokenHolder).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        let tx = defi5.connect(tokenHolder).exitPool(amount, amounts);
        await validateBurn(
          tx,
          OLD_DEFI5_DATA,
          defi5,
          tokenHolder.address,
          tokenHolder.address,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await defi5
          .connect(tokenHolder)
          .balanceOf(tokenHolder.address);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          defi5.connect(tokenHolder).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(defi5, amount);
        let tx = defi5.connect(tokenHolder).exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_DEFI5_DATA,
          defi5,
          tokenHolder.address,
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

    testStorage("cc10");

    testTokenBalances(CC10, "CC10");

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          cc10.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          cc10.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          cc10
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await cc10.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          cc10.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await cc10.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          cc10.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          cc10
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(cc10, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await cc10
          .connect(tokenHolder)
          .approve(wallet.address, constants.MaxUint256);
        await expect(
          cc10.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(cc10, "Approval");
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await cc10.connect(tokenHolder).approve(wallet.address, 1);
        await expect(cc10.transferFrom(tokenHolder.address, wallet.address, 1))
          .to.emit(cc10, "Approval")
          .withArgs(tokenHolder.address, wallet.address, 0);
        expect(await cc10.allowance(tokenHolder.address, wallet.address)).to.eq(
          0
        );
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await cc10
          .connect(tokenHolder)
          .balanceOf(tokenHolder.address);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          cc10.connect(tokenHolder).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          cc10.connect(tokenHolder).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          cc10.connect(tokenHolder).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        let tx = cc10.connect(tokenHolder).exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_CC10_DATA,
          cc10,
          tokenHolder.address,
          wallet.address,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await cc10
          .connect(tokenHolder)
          .balanceOf(tokenHolder.address);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          cc10.connect(tokenHolder).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(cc10, amount);
        let tx = cc10.connect(tokenHolder).exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_CC10_DATA,
          cc10,
          tokenHolder.address,
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

    describe("transferFrom", async () => {
      it("Reverts if insufficient balance", async () => {
        await expect(
          fff.transferFrom(wallet.address, wallet1.address, 1)
        ).to.be.revertedWith("ERR_INSUFFICIENT_BAL");
      });

      it("Reverts if insufficient allowance", async () => {
        await expect(
          fff.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.be.revertedWith("ERR_BTOKEN_BAD_CALLER");
      });

      it("Does not revert if insufficient allowance but caller == src", async () => {
        await expect(
          fff
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.be.reverted;
      });

      it("Reverts if src == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await fff.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          fff.transferFrom(uniswapPair, wallet.address, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Reverts if dst == pair", async () => {
        await withSignerAndGasMoney(uniswapPair, async (signer) => {
          await fff.connect(signer).approve(wallet.address, 1);
        });

        await expect(
          fff.transferFrom(wallet.address, uniswapPair, 1)
        ).to.be.revertedWith("ERR_UNI_TRANSFER");
      });

      it("Does not emit Approval if caller == src", async () => {
        await expect(
          fff
            .connect(tokenHolder)
            .transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(fff, "Approval");
      });

      it("Does not emit Approval if max allowance", async () => {
        await fff
          .connect(tokenHolder)
          .approve(wallet.address, constants.MaxUint256);
        await expect(
          fff.transferFrom(tokenHolder.address, wallet.address, 1)
        ).to.not.emit(fff, "Approval");
      });

      it("Updates approval if caller != src and allowance != max", async () => {
        await fff.connect(tokenHolder).approve(wallet.address, 1);
        await expect(fff.transferFrom(tokenHolder.address, wallet.address, 1))
          .to.emit(fff, "Approval")
          .withArgs(tokenHolder.address, wallet.address, 0);
        expect(await fff.allowance(tokenHolder.address, wallet.address)).to.eq(
          0
        );
      });
    });

    describe("exitPool", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await fff.connect(tokenHolder).balanceOf(tokenHolder.address);
      });

      it("Reverts if minAmountOut higher than actual value", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        amounts[0] = amounts[0].add(1);
        await expect(
          fff.connect(tokenHolder).exitPool(amount, amounts)
        ).to.be.revertedWith("ERR_LIMIT_OUT");
      });

      it("Reverts if length of minAmountsOut does not match tokens", async () => {
        const amount = balance.div(10);
        await expect(
          fff.connect(tokenHolder).exitPool(amount, [])
        ).to.be.revertedWith("ERR_ARR_LEN");
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          fff.connect(tokenHolder).exitPool(0, [])
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        let tx = fff.connect(tokenHolder).exitPool(amount, amounts);
        await validateBurn(
          tx,
          OLD_FFF_DATA,
          fff,
          tokenHolder.address,
          tokenHolder.address,
          amount,
          amounts
        );
      });
    });

    describe("exitPoolTo", () => {
      let balance: BigNumber;

      before(async () => {
        balance = await fff.connect(tokenHolder).balanceOf(tokenHolder.address);
      });

      it("Reverts if amount is 0", async () => {
        await expect(
          fff.connect(tokenHolder).exitPoolTo(wallet.address, 0)
        ).to.be.revertedWith("ERR_NULL_AMOUNT");
      });

      it("Burns pool tokens for underlying tokens", async () => {
        const amount = balance.div(10);
        const amounts = await getAmountsOut(fff, amount);
        let tx = fff.connect(tokenHolder).exitPoolTo(wallet.address, amount);
        await validateBurn(
          tx,
          OLD_FFF_DATA,
          fff,
          tokenHolder.address,
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
        let tx = fff.connect(tokenHolder).exitPoolTo(wallet.address, amount);
        await expect(tx)
          .to.emit(fff, "Transfer")
          .withArgs(tokenHolder.address, constants.AddressZero, amount);
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
        await withSignerAndGasMoney(
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
        await withSignerAndGasMoney(
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
        await withSignerAndGasMoney(
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
