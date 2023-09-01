module.exports = {
  skipFiles: ['interfaces/', 'mocks/', 'dependencies/', 'test/'],
  configureYulOptimizer: true,
  optimizer: {
    enabled: true,
    runs: 200,
  },
};
