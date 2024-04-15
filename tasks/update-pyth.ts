import PythAbi from '@pythnetwork/pyth-sdk-solidity/abis/IPyth.json';
import axios from 'axios';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { currencyIterator } from '../utils/currencies';

const HERMES_API_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

task('update-pyth', 'Update the Pyth price feeds').setAction(
  async (_, { ethers }) => {
    const { PYTH_PRICE_FEED_ADDRESS } = process.env;

    if (!PYTH_PRICE_FEED_ADDRESS) {
      const message =
        'The following environment variables must be set: PYTH_PRICE_FEED_ADDRESS';
      throw new HardhatPluginError('SecuredFinance', message);
    }

    for (const currency of currencyIterator()) {
      const {
        data: { binary },
      } = await axios.get(HERMES_API_URL, {
        params: { ids: [currency.pythPriceFeed.priceId] },
      });

      const pyth = await ethers.getContractAt(PythAbi, PYTH_PRICE_FEED_ADDRESS);
      const updateData = [`0x${binary.data[0]}`];
      const feeAmount = await pyth.getUpdateFee(updateData);

      await pyth
        .updatePriceFeeds(updateData, { value: feeAmount })
        .then((tx) => tx.wait());

      console.log(
        `Updated Pyth price feed for ${
          currency.symbol
        }/USD with a fee of ${feeAmount.toString()}.`,
      );
    }
  },
);
