import { BigNumber } from "ethers"
import { getBigNumber } from "./chain"

export const bmul = (a: BigNumber, b: BigNumber) => {
  const c0 = a.mul(b)
  const c1 = c0.add(getBigNumber(5, 17))
  const c2 = c1.div(getBigNumber(1))
  return c2
}

export const bdiv = (a: BigNumber, b: BigNumber) => {
  const c0 = a.mul(getBigNumber(1))
  const c1 = c0.add(b.div(2))
  const c2 = c1.div(b)
  return c2
}