# Drain Reversal

In November 2021, the Indexed DAO passed governance proposal 16 to drain the DEFI5, CC10 and FFF index pools of all their ERC20 tokens, drain the ETH from their Uniswap markets and drain the sidechain markets on Polygon.

For each index pool, the following steps were executed:
1. Send a deposit to the Polygon bridge by returning `true` in `transferFrom()`, without actually affecting storage.
2. Transfer all the held tokens to the Indexed treasury.
3. Move all but 1 wei of WETH from the Uniswap pair for the token and WETH to the treasury.
4. Sync the pair with a very high reserve in the index token and a balance of 1 in WETH.
5. The pool's implementation contract is replaced with one that does not allow transfers or other state changes.

We need to reverse all of these steps in a manner sufficient to enable everyone who held any of the index tokens (including indirectly, e.g. LP tokens, sidechain deposits or staking).

The requirements for this drain reversal are:
1. No special logic for different contracts: any contract which previously had the ability to recover value from the index tokens (via transfer or full burn) should be able to handle them as it did previously.
2. No lost funds: the reversal should not allow for any kind of arbitrage or other loss of tokens prior to a holder executing a burn.

If we were to return ETH to the Uniswap pairs and restore their balances, people would likely try to arbitrage them for whatever value differential there is between the underlying assets and their market price.

Instead of allowing this, we should simply provide a mechanism for people to transfer their LP tokens to a contract in order to reclaim the underlying ETH and index tokens.

Additionally, the DEFI5 and CC10 pools have a lot of overlap in their assets. Rather than have the treasury directly transfer each token to the appropriate pools, it makes sense to have an intermediate contract handle that.

We thus need three contracts.

**Index Pool**

- Enable all ERC20 functionality
  - Disable all transfers to or from the Uniswap market pair to ensure the supply does not change, important to LP Burn contract.
- Implement the index pool interface to ensure it remains compatible with contracts holding pool tokens, but disable all state-changing pool features other than burning for all outputs.
- Add an `initialize()` function which must be executed prior to any other function being enabled and which only the timelock can call.
  - Moves the balance of the Uniswap pair to the LP Burn contract.

**LP Burn**

No contracts other than staking pools hold more than a thousandth of an LP token, so backwards compatibility is not a concern.

- Receives WETH from timelock.
- Receives index tokens from LP contract
- Executes transferFrom of LP tokens from caller to null address.
  - Burns underlying index tokens owed to caller

**Token Distributor**

- Receives all the ERC20 tokens to be transferred from the treasury.
- Transfers the appropriate amount of each asset to the index pools.
- Transfers WETH to the LP Burn contract.
- Initializes the index pools.

## Proposal

We will need two proposals to reverse the drain.

Proposal #1 will transfer 10 of the 14 assets to the token redistributor.

Proposal #2 will transfer the other 4 assets to the token redistributor, then update the core and sigma index pool implementations to the two fallthrough contracts, then call the `restoreBalances()` function on the token redistributor. 

## Scripts

`yarn test`

Runs all tests in `test/`

`yarn coverage`

Runs all tests with solidity-coverage and generates a coverage report.

`yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

`yarn lint`

Runs solhint against the contracts.
