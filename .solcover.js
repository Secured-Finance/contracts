module.exports = {
  skipFiles: ['interfaces/', 'mocks/', 'dependencies/', 'external/'],
  configureYulOptimizer: true,
  optimizer: {
    enabled: true,
    runs: 200,
  },
};
