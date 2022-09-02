import axios from 'axios';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';

task('unfork', 'Delete a forked environment')
  .addParam('forkid', 'The forked environment id on Tenderly')
  .setAction(async ({ forkid }) => {
    const { TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } =
      process.env;

    if (!TENDERLY_USER || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY) {
      const message =
        'The following environment variables must be set: TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY';
      throw new HardhatPluginError('SecuredFinance', message);
    }

    const url = `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/fork/${forkid}`;
    const opts = {
      headers: { 'X-Access-Key': TENDERLY_ACCESS_KEY },
    };

    await axios.delete(url, opts);

    console.log('Successfully deleted the forked environment!');
  });
