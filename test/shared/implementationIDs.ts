import { keccak256 } from 'ethers/lib/utils'
export const sha3 = (value: string) => keccak256(Buffer.from(value))

export const corePoolImplementationID = sha3('IndexPool.sol')
export const sigmaPoolImplementationID = sha3('SigmaIndexPoolV1.sol')
export const coreSellerImplementationID = sha3('UnboundTokenSeller.sol')
export const coreControllerAddress = '0xF00A38376C8668fC1f3Cd3dAeef42E0E44A7Fcdb'
export const sigmaControllerAddress = '0x5B470A8C134D397466A1a603678DadDa678CBC29'
