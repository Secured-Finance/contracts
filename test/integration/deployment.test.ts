import { expect } from 'chai';
import { ethers } from 'hardhat';

import { currencyIterator, mocks } from '../../utils/currencies';
import { deployContracts } from '../common/deployment';

describe('Integration Test: deployment fixture', () => {
  it('preserves currency arguments and token supplies across repeated deployments', async () => {
    const currencies = Array.from(currencyIterator());
    const initialArgs = currencies.map((currency) => [...currency.args]);

    for (let deploymentIndex = 0; deploymentIndex < 2; deploymentIndex++) {
      const { tokenVault } = await deployContracts();

      expect(currencies.map((currency) => currency.args)).to.deep.equal(
        initialArgs,
      );

      for (const [index, currency] of currencies.entries()) {
        if (currency.isNative) {
          continue;
        }

        const token = await ethers.getContractAt(
          mocks[currency.symbol].tokenName,
          await tokenVault.getTokenAddress(currency.key),
        );
        expect(await token.totalSupply()).to.equal(initialArgs[index][0]);
      }
    }
  });
});
