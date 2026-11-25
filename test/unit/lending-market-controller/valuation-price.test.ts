import { expect } from 'chai';
import { deployMockContract, MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers } from 'hardhat';

import { deployContracts } from './utils';

describe('FundManagementLogic - Valuation price selection', () => {
  let valuationPriceCaller: Contract;
  let market: MockContract;

  before(async () => {
    const [owner] = await ethers.getSigners();
    const deployed = await deployContracts(owner);
    valuationPriceCaller = await ethers
      .getContractFactory('FundManagementLogicCaller', {
        libraries: {
          FundManagementLogic: deployed.fundManagementLogic.address,
        },
      })
      .then((factory) => factory.deploy());
    market = await deployMockContract(
      owner,
      (
        await artifacts.readArtifact('ILendingMarket')
      ).abi,
    );
  });

  for (const { title, standard, live, lending, borrowing } of [
    {
      title: 'both prices are missing',
      standard: 0,
      live: 0,
      lending: 0,
      borrowing: 0,
    },
    {
      title: 'only the live price exists',
      standard: 0,
      live: 9400,
      lending: 9400,
      borrowing: 9400,
    },
    {
      title: 'only the standard price exists',
      standard: 9600,
      live: 0,
      lending: 9600,
      borrowing: 9600,
    },
    {
      title: 'the live price falls',
      standard: 9600,
      live: 9400,
      lending: 9400,
      borrowing: 9600,
    },
    {
      title: 'the live price rises',
      standard: 9600,
      live: 9800,
      lending: 9600,
      borrowing: 9800,
    },
  ]) {
    it(`selects the correct lending and borrowing prices when ${title}`, async () => {
      await market.mock.getMarketUnitPrice.withArgs(1).returns(standard);
      await market.mock.getLiveUnitPrice.withArgs(1).returns(live);
      expect(
        await valuationPriceCaller.getUnitPriceForValuation(
          market.address,
          false,
          1,
          true,
        ),
      ).to.equal(standard);
      expect(
        await valuationPriceCaller.getUnitPriceForValuation(
          market.address,
          false,
          1,
          false,
        ),
      ).to.equal(standard);
      expect(
        await valuationPriceCaller.getUnitPriceForValuation(
          market.address,
          true,
          1,
          true,
        ),
      ).to.equal(lending);
      expect(
        await valuationPriceCaller.getUnitPriceForValuation(
          market.address,
          true,
          1,
          false,
        ),
      ).to.equal(borrowing);
    });
  }
});
