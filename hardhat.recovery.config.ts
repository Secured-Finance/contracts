import config from './hardhat.config';

// Run the one-off recovery suite on its own chain so its fixed maturity never
// requires changing time or fixtures in the normal unit/integration suites.
export default {
  ...config,
  networks: {
    ...config.networks,
    hardhat: {
      ...config.networks?.hardhat,
      initialDate: '2026-11-21T00:00:00Z',
    },
  },
  paths: { ...config.paths, tests: './test-recovery' },
};
