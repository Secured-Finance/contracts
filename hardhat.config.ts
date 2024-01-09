import '@nomicfoundation/hardhat-verify';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-ganache';
import '@nomiclabs/hardhat-truffle5';
import '@nomiclabs/hardhat-waffle';
import 'dotenv/config';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/config';
import 'solidity-coverage';
import 'solidity-docgen';

import { HttpNetworkUserConfig } from 'hardhat/types';
import './tasks';

const privateKey =
  process.env.USE_DEFAULT_ACCOUNTS === 'true' || !process.env.PRIVATE_KEY
    ? undefined
    : [process.env.PRIVATE_KEY];
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const alchemyNetworkKeys = {
  1: 'eth-mainnet',
  421614: 'arb-sepolia',
  11155111: 'eth-sepolia',
};

const networkConfig = (chainId: number): HttpNetworkUserConfig => ({
  url:
    process.env.FORK_RPC_ENDPOINT ||
    `https://${alchemyNetworkKeys[chainId]}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  chainId,
  accounts: privateKey,
  live: true,
  saveDeployments: true,
  gasPrice: 'auto',
  gasMultiplier: 3,
});

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    alice: 1,
  },
  networks: {
    hardhat: { accounts: { count: 50 } },
    localhost: {
      url: process.env.DEV_RPC_ENDPOINT || 'http://0.0.0.0:8545',
      chainId: parseInt(process.env.DEV_CHAIN_ID || '1337'),
      accounts: privateKey,
    },
    development: networkConfig(11155111),
    'development-arb': networkConfig(421614),
    staging: networkConfig(11155111),
    'staging-arb': networkConfig(421614),
    sepolia: networkConfig(11155111),
    'arbitrum-sepolia': networkConfig(421614),
    mainnet: networkConfig(1),
    'arbitrum-one': networkConfig(42161),
  },
  solidity: {
    compilers: [
      {
        version: '0.8.19',
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
    timeout: 0,
    // reporter: 'eth-gas-reporter',
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  docgen: {
    pages: 'files',
    exclude: ['mocks', 'interfaces', 'dependencies'],
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
