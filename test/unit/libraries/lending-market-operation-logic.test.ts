import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers, waffle } from 'hardhat';

import moment from 'moment';

const { loadFixture } = waffle;

describe('LendingMarketOperationLogic', function () {
  let owner: SignerWithAddress;
  let lib: Contract;

  before(async () => {
    [owner] = await ethers.getSigners();
  });

  async function deployOnceFixture() {
    const LendingMarketOperationLogic = await ethers.getContractFactory(
      'LendingMarketOperationLogic',
    );
    const lib = await LendingMarketOperationLogic.deploy();
    await lib.deployed();

    return { lib, owner };
  }

  beforeEach(async () => {
    ({ lib, owner } = await loadFixture(deployOnceFixture));
  });

  describe('Testing calculateNextMaturity()', function () {
    it('Get the last Friday after 3 months', async function () {
      const now = moment().unix();
      const nextMaturity = await lib.calculateNextMaturity(now, 3);

      expect(moment.unix(nextMaturity).day()).to.equal(5);
      expect(moment.unix(nextMaturity).month()).to.equal(
        moment.unix(now).add(3, 'M').month(),
      );
    });

    it('Get the date 1 week later', async function () {
      const now = moment().unix();
      const nextMaturity = await lib.calculateNextMaturity(now, 0);

      expect(moment.unix(nextMaturity).day()).to.equal(moment.unix(now).day());
      expect(moment.unix(nextMaturity).unix()).to.equal(
        moment.unix(now).add(1, 'w').unix(),
      );
    });
  });
});
