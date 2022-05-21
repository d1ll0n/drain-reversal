export * from './pair-data'
export * from './pool-data'
export * from './holders'
export * from './covalent'
export * from './balances'
import { BigNumber } from 'ethers'
import RAW_TREASURY_TRANSFERS from './TREASURY_TRANSFERS.json'
const TreasuryTransfers = RAW_TREASURY_TRANSFERS.map(({ token, amount }) => ({ token, amount: BigNumber.from(amount) }))
export { TreasuryTransfers }
