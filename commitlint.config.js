module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      issuePrefixes: ['SF-', '#'],
    },
  },
  rules: {
    'references-empty': [2, 'never'],
  },
};
