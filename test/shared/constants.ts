import { BigNumber } from "ethers"

export const defi5Tokens = [
  '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  '0xD533a949740bb3306d119CC777fa900bA034cd52',
  '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
]

export const cc10Tokens = [
  '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
  '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
  '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  '0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828',
  '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  '0xD533a949740bb3306d119CC777fa900bA034cd52',
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
  '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
]

export const fffTokens = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  '0x126c121f99e1E211dF2e5f8De2d96Fa36647c855',
]

export const cc10SellerTokens = [
  '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
  '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
]

export const CC10_DRAINED_TOKENS = [
  '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
  '0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828',
  '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
  '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  '0xD533a949740bb3306d119CC777fa900bA034cd52',
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
  '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
];

export const DEFI5_DRAINED_TOKENS = defi5Tokens;

export const FFF_DRAINED_TOKENS = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  '0x126c121f99e1E211dF2e5f8De2d96Fa36647c855',
]

export const UNISWAP_PAIRS = {
  defi5: '0x8dCBa0B75c1038c4BaBBdc0Ff3bD9a8f6979Dd13',
  cc10: '0x2701eA55b8B4f0FE46C15a0F560e9cf0C430f833',
  fff: '0x9A60F0A46C1485D4BDA7750AdB0dB1b17Aa48A33',
}

export const PAIR_BALANCES = {
  defi5:  BigNumber.from('0x01e3ca8ff2b0a3df463c'),
  cc10:  BigNumber.from('0x3d49586d9370d87fbf3ebc'),
  fff:  BigNumber.from('0x5a40e626fd8f29987f'),
}

export const ALLOWANCE_CHECKS = {
  defi5: ['0x7d0ec6953c01cdf17b04926fa34c80dfc5ca4bd7', '0x1111111254fb6c44bac0bed2854e76f90643097d'],
  cc10: ['0xc87fc808c3e9227146dc5ab0fbac5b3c86e78008', '0x11111112542d85b3ef69ae05771c2dccff4faa26'],
  fff: ['0x6d98f705bdf4ee437b15d0de31a5a1a5e55ea14d', '0x216b4b4ba9f3e719726886d34a177484278bfcae'],
}

export const DEFI5 = '0xfa6de2697D59E88Ed7Fc4dFE5A33daC43565ea41'
export const CC10 = '0x17aC188e09A7890a1844E5E65471fE8b0CcFadF3'
export const FFF = '0xaBAfA52D3d5A2c18A4C1Ae24480D22B831fC0413'
export const DEGEN = '0x126c121f99e1E211dF2e5f8De2d96Fa36647c855'
export const ORCL5 = '0xD6cb2aDF47655B1bABdDc214d79257348CBC39A7'

export const treasury = '0x78a3eF33cF033381FEB43ba4212f2Af5A5A0a2EA'

export const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'

export const UNISWAP_FACTORY_ADDRESS = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'

export const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

export const DRAIN_BLOCK = 13706170

export const MULTI_TOKEN_STAKING = '0xC46E0E7eCb3EfCC417f6F89b940FFAFf72556382'

export const ProxyManagerAccessControl = '0x3D4860d4b7952A3CAD3Accfada61463F15fc0D54';

export const ProxyManager = '0xD23DeDC599bD56767e42D48484d6Ca96ab01C115';

export const GovernorAlpha = '0x95129751769f99cc39824a0793ef4933dd8bb74b';

export const NDX = '0x86772b1409b61c639eaac9ba0acfbb6e238e5f83';

export type PoolName = keyof typeof UNISWAP_PAIRS;