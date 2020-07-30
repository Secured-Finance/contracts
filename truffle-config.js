require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

const customProvider = (mnemonic, rpcEndpoint) => () =>
  new HDWalletProvider(mnemonic, rpcEndpoint);

const infuraProvider = (network) =>
  customProvider(
    process.env.MNEMONIC || process.env.PRIVATE_KEY || '',
    `https://${network}.infura.io/v3/${process.env.WEB3_INFURA_ID}`,
  );

const ropstenProvider = infuraProvider('ropsten');

module.exports = {
  contracts_directory: './contracts',
  contracts_build_directory: './contracts',
  migrations_directory: './migrations',
  networks: {
    development: {
      host: '127.0.0.1',
      port: 9545,
      network_id: '*', // Match any network id
    },
    ropsten: {
      provider: ropstenProvider,
      network_id: 3,
      // gasPrice: 5000000000,
      // gas: 4500000,
      // gasPrice: 10000000000,
      // confirmations: 0, // # of confs to wait between deployments. (default: 0)
      skipDryRun: true,
    },
    ganache: {
      host: 'ganache',
      port: 7545,
      network_id: '*',
    },
  },
  compilers: {
    solc: {
      version: '0.6.12',
      settings: {
        optimizer: {
          enabled: true, // Default: false
          runs: 0, // Default: 200
        },
      },
    },
  },
};
