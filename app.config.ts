import { config } from 'dotenv';
config();

export const WEB3_CONFIG = {
  NETWORK_ID: process.env.WEB3_NETWORK_ID,
  PROVIDER: {
    1: 'https://mainnet.infura.io:443/v3/' + process.env.WEB3_INFURA_ID,
    3: 'https://ropsten.infura.io/v3/' + process.env.WEB3_INFURA_ID,
    4: 'https://rinkeby.infura.io/v3/' + process.env.WEB3_INFURA_ID,
    5777: process.env.RPC_ENDPOINT || 'ws://ganache:7545',
  },
  CHAIN: {
    1: 'mainnet',
    3: 'ropsten',
    4: 'rinkeby',
    5777: '',
  },
};
