import "dotenv/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy'
import 'solidity-coverage'

import { randomBytes } from 'crypto';

const configureNetwork = (network: string, chainId: number) => ({
  url: `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`,
  chainId,
  accounts: [process.env[`${network.toUpperCase()}_PVT_KEY`] ?? randomBytes(32).toString('hex')]
});

export default {
  mocha: {
    timeout: 50000
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: false,
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        accounts: [randomBytes(32).toString('hex')],
        blockNumber: 14803591
      }
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 1,
      accounts: [process.env.MAINNET_PVT_KEY ?? randomBytes(32).toString('hex')]
    },
    kovan: configureNetwork('kovan', 42),
    rinkeby: configureNetwork('rinkeby', 4)
  },
  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
}
