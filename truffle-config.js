require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

const customProvider = (mnemonic, rpcEndpoint) => () =>
  new HDWalletProvider(mnemonic, rpcEndpoint);

const infuraProvider = (network) =>
  customProvider(
    process.env.MNEMONIC || process.env.PRIVATE_KEY || '',
    `wss://${network}.infura.io/ws/v3/${process.env.WEB3_INFURA_ID}`,
  );

const ropstenProvider = infuraProvider('ropsten');

module.exports = {
  // contracts_directory: './contracts',
  // contracts_build_directory: './build/contracts',
  // migrations_directory: './migrations',
  test_file_extension_regexp: /.*\.js$/,

  networks: {
    development: {
      host: '0.0.0.0', // Localhost (default: none)
      port: 8545, // Standard Ethereum port (default: none)
      network_id: '*', // Any network (default: none)
    },

    ropsten: {
      provider: ropstenProvider,
      network_id: 3,
      // gasPrice: 5000000000,
      // gas: 4500000,
      // gasPrice: 10000000000,
      // confirmations: 0, // # of confs to wait between deployments. (default: 0)
      skipDryRun: true,
      gas: 8000000,
      websockets: true,
      networkCheckTimeout: 90000,
    },

    // this is necessary for coverage
    coverage: {
        host: 'localhost',
        network_id: '*', // eslint-disable-line camelcase
        port: 8555,
        gas: 0xfffffffffff,
        gasPrice: 0x01,
    },
  },

  mocha: {
    timeout: 100000,
    reporter: 'eth-gas-reporter',
  },

  compilers: {
    solc: {
      version: '0.6.12',
      settings: {
        optimizer: {
          enabled: true, // Default: false
          runs: 200, // Default: 200
        },
      },
    },
  },
};
