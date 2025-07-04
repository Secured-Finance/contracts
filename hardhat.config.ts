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
import { getNodeEndpoint } from './utils/deployment';

const privateKey =
  process.env.USE_DEFAULT_ACCOUNTS === 'true' || !process.env.PRIVATE_KEY
    ? undefined
    : [process.env.PRIVATE_KEY];
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const networkConfig = (chainId: number): HttpNetworkUserConfig => ({
  url: process.env.FORK_RPC_ENDPOINT || getNodeEndpoint(chainId.toString()),
  chainId,
  accounts: privateKey,
  live: true,
  saveDeployments: true,
  gasPrice: 'auto',
  gasMultiplier: 3,
  httpHeaders: process.env.GLIF_API_KEY
    ? {
        Authorization: `Bearer ${process.env.GLIF_API_KEY}`,
      }
    : undefined,
});

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    alice: 1,
  },
  networks: {
    hardhat: { accounts: { count: 100 } },
    localhost: {
      url: process.env.DEV_RPC_ENDPOINT || 'http://127.0.0.1:8545',
      chainId: parseInt(process.env.DEV_CHAIN_ID || '31337'),
      accounts: privateKey,
    },
    development: networkConfig(11155111),
    'development-arb': networkConfig(421614),
    'development-ava': networkConfig(43113),
    'development-fil': networkConfig(314159),
    staging: networkConfig(11155111),
    'staging-arb': networkConfig(421614),
    'staging-ava': networkConfig(43113),
    'staging-fil': networkConfig(314159),
    sepolia: networkConfig(11155111),
    mainnet: networkConfig(1),
    'arbitrum-sepolia': networkConfig(421614),
    'arbitrum-one': networkConfig(42161),
    'avalanche-mainnet': networkConfig(43114),
    'polygon-zkevm-mainnet': networkConfig(1101),
    'filecoin-mainnet': networkConfig(314),
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
    customChains: [
      {
        network: 'arbitrum-sepolia',
        chainId: 421614,
        urls: {
          apiURL: 'https://api-sepolia.arbiscan.io/api',
          browserURL: 'https://sepolia.arbiscan.io',
        },
      },
    ],
  },
};

export default config;
