import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { artifacts, ethers, waffle } from 'hardhat';

import moment from 'moment';

const { deployContract, loadFixture } = waffle;

// libraries
const LendingMarketOperationLogic = artifacts.require(
  'LendingMarketOperationLogic',
);
const LendingMarketConfigurationLogic = artifacts.require(
  'LendingMarketConfigurationLogic',
);

describe('LendingMarketOperationLogic', function () {
  let owner: SignerWithAddress;

  before(async () => {
    [owner] = await ethers.getSigners();
  });

  async function deployOnceFixture() {
    const lendingMarketConfigurationLogic = await deployContract(
      owner,
      LendingMarketConfigurationLogic,
    );

    const lib = await ethers
      .getContractFactory('LendingMarketOperationLogic', {
        libraries: {
          LendingMarketConfigurationLogic:
            lendingMarketConfigurationLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    return { lib, owner };
  }

  describe('Testing calculateNextMaturity()', function () {
    it('Get the last Friday after 3 months', async function () {
      const { lib } = await loadFixture(deployOnceFixture);
      const now = moment().unix();
      const nextMaturity = await lib.calculateNextMaturity(now, 3);

      expect(moment.unix(nextMaturity).day()).to.equal(5);
      expect(moment.unix(nextMaturity).month()).to.equal(
        moment.unix(now).add(3, 'M').month(),
      );
    });

    it('Get the date 1 week later', async function () {
      const { lib } = await loadFixture(deployOnceFixture);
      const now = moment().unix();
      const nextMaturity = await lib.calculateNextMaturity(now, 0);

      expect(moment.unix(nextMaturity).day()).to.equal(moment.unix(now).day());
      expect(moment.unix(nextMaturity).unix()).to.equal(
        moment.unix(now).add(1, 'w').unix(),
      );
    });
  });
});
