const axios = require('axios');
const { HardhatPluginError } = require('hardhat/internal/core/errors');

task('fork', 'Create a forked environment').setAction(async () => {
  const blockNumber = await ethers.provider.getBlockNumber();
  const network = await ethers.provider.getNetwork();

  const { TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;

  if (!TENDERLY_USER || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY) {
    const message =
      'The following environment variables must be set: TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY';
    throw new HardhatPluginError('SecuredFinance', message);
  }

  const url = `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/fork`;
  const opts = {
    headers: { 'X-Access-Key': TENDERLY_ACCESS_KEY },
  };

  const body = {
    network_id: network.chainId,
    block_number: blockNumber,
  };

  const res = await axios.post(url, body, opts);

  console.log(
    `Successfully forked environment with chain ID ${network.chainId}!`,
  );
  console.log(res.data.simulation_fork.id);
});

module.exports = {};
