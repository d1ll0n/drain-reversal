import { BigNumber } from 'ethers'
import { TokenHolder } from './covalent'
import RAW_CC10_HOLDERS from './CC10_HOLDERS.json'
import RAW_DEFI5_HOLDERS from './DEFI5_HOLDERS.json'
import RAW_FFF_HOLDERS from './FFF_HOLDERS.json'

const [CC10_HOLDERS, DEFI5_HOLDERS, FFF_HOLDERS]: TokenHolder[][] = [RAW_CC10_HOLDERS, RAW_DEFI5_HOLDERS, RAW_FFF_HOLDERS].map(
  (holdersArr) =>
    holdersArr.map((holder) => ({
      address: holder.address,
      balance: BigNumber.from(holder.balance),
    }))
)

export const HOLDERS = {
  DEFI5: DEFI5_HOLDERS,
  CC10: CC10_HOLDERS,
  FFF: FFF_HOLDERS,
}
