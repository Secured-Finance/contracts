require('dotenv/config');
require('@nomiclabs/hardhat-truffle5');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-contract-sizer');
require('hardhat-deploy');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-ganache');

module.exports = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    alice: 1,
  }, 
  networks: {
    hardhat: {},
    development: {
      url: 'http://0.0.0.0:8545', // Localhost (default: none)
      chainId: 1337,
      // port: 8545, // Standard Ethereum port (default: none)
      // network_id: '*', // Any network (default: none)
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.WEB3_INFURA_ID}`,
      chainId: 3,
      accounts: [process.env.PRIVATE_KEY],
      live: true,
      saveDeployments: true,
      gasPrice: 11000000000,
      gasMultiplier: 3,
      timeout: 240000,
    },
  },
  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './build',
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 125,
  },
  mocha: {
    timeout: 100000,
    // reporter: 'eth-gas-reporter',
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
};
