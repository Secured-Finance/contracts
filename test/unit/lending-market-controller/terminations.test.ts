import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import moment from 'moment';

import { getGenesisDate } from '../../../utils/dates';
import {
  AUTO_ROLL_FEE_RATE,
  INITIAL_COMPOUND_FACTOR,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { deployContracts } from './utils';

// contracts
const MockERC20 = artifacts.require('MockERC20');

const { deployMockContract } = waffle;

describe('LendingMarketController - Terminations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockERC20: MockContract;
  let lendingMarketControllerProxy: Contract;
  let lendingMarketProxies: Contract[];

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, ...signers] = await ethers.getSigners();

    ({ mockCurrencyController, mockTokenVault, lendingMarketControllerProxy } =
      await deployContracts(owner));

    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockTokenVault.mock.isCovered.returns(true);
  });

  describe('Terminations', async () => {
    const initialize = async (currency: string, openingDate = genesisDate) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          currency,
          openingDate,
        );
      }

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(currency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      );

      maturities = await lendingMarketControllerProxy.getMaturities(currency);
    };

    it('Execute an emergency termination', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const openingDate = moment(timestamp * 1000)
        .add(2, 'h')
        .unix();

      await initialize(targetCurrency, openingDate);

      await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
      await mockCurrencyController.mock.getLastETHPrice.returns(10000000000);
      await mockCurrencyController.mock[
        'convertToETH(bytes32,uint256)'
      ].returns(20000000000);
      await mockTokenVault.mock.getCollateralCurrencies.returns([
        targetCurrency,
      ]);
      await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
      await mockERC20.mock.balanceOf.returns(1000000000);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');
    });
  });
});
