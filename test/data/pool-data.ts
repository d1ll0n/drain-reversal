import { IRestrictedIndexPool } from '../../typechain'

export type PoolRecord = {
  bound: boolean
  ready: boolean
  lastDenormUpdate: number
  denorm: string
  desiredDenorm: string
  index: number
  balance: string
}

export type PoolData = {
  totalSupply: string
  name: string
  symbol: string
  getController: string
  isPublicSwap: boolean
  getSwapFee: string
  getTotalDenormalizedWeight: string
  getExitFeeRecipient: string
  getExitFee: string
  getNumTokens: number
  getCurrentTokens: string[]
  getCurrentDesiredTokens: string[]
  records: PoolRecord[]
}

export async function getPoolData(
  pool: IRestrictedIndexPool,
  blockTag: number | 'latest' = 'latest'
): Promise<PoolData> {
  const tokens = await pool.getCurrentTokens({ blockTag })
  const records = await Promise.all(
    tokens.map((t) =>
      pool
        .getTokenRecord(t, { blockTag })
        .then(({ denorm, desiredDenorm, balance, bound, ready, lastDenormUpdate, index }) => ({
          bound,
          ready,
          lastDenormUpdate,
          index,
          denorm: denorm.toHexString(),
          desiredDenorm: desiredDenorm.toHexString(),
          balance: balance.toHexString(),
        }))
    )
  )
  return {
    totalSupply: (await pool.totalSupply({ blockTag })).toHexString(),
    name: await pool.name({ blockTag }),
    symbol: await pool.symbol({ blockTag }),
    getController: await pool.getController({ blockTag }),
    isPublicSwap: await pool.isPublicSwap({ blockTag }),
    getSwapFee: (await pool.getSwapFee({ blockTag })).toHexString(),
    getTotalDenormalizedWeight: (await pool.getTotalDenormalizedWeight({ blockTag })).toHexString(),
    getExitFeeRecipient: await pool.getExitFeeRecipient({ blockTag }),
    getExitFee: (await pool.getExitFee({ blockTag })).toHexString(),
    getNumTokens: (await pool.getNumTokens({ blockTag })).toNumber(),
    getCurrentTokens: tokens,
    getCurrentDesiredTokens: await pool.getCurrentDesiredTokens({ blockTag }),
    records,
  }
}
