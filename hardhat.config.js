require('dotenv/config');
require('@nomiclabs/hardhat-truffle5');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-contract-sizer');
require('hardhat-deploy');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-ganache');

const DUMMY_PRIVATE_KEY = "abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd";

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
      accounts: [process.env.PRIVATE_KEY || DUMMY_PRIVATE_KEY],
      live: true,
      saveDeployments: true,
      gasPrice: 11000000000,
      gasMultiplier: 3,
      timeout: 240000,
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 4,
      accounts: [process.env.PRIVATE_KEY || DUMMY_PRIVATE_KEY],
      live: true,
      saveDeployments: true,
      gasPrice: 1500000000,
      gasMultiplier: 3,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.6.12',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.7.0',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      { version: '0.4.24' },
    ],
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