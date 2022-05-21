require('dotenv').config()

module.exports = {
  norpc: true,
  skipFiles: ["lib/", "interfaces/", "test/"],
  providerOptions: {
    host: "localhost",
    port: 8545,
    network_id: "1234567890",
    networkCheckTimeout: 60000,
    fork: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
    fork_block_number: 14803591
  },
}