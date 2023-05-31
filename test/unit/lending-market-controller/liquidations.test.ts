import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  AUTO_ROLL_FEE_RATE,
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { deployContracts } from './utils';

describe('LendingMarketController - Liquidations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let lendingMarketControllerProxy: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      lendingMarketControllerProxy,
      fundManagementLogic,
      lendingMarketOperationLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );
    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
  });

  describe('Liquidations', async () => {
    let lendingMarketProxies: Contract[];
    let maturities: BigNumber[];

    const initialize = async (currency: string) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        AUTO_ROLL_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          currency,
          genesisDate,
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

    beforeEach(async () => {
      // Set up for the mocks
      await mockTokenVault.mock.isCovered.returns(true);

      await initialize(targetCurrency);
    });

    beforeEach(async () => {
      // Set up for the mocks
      await mockTokenVault.mock.getLiquidationAmount.returns(1000, 20, 10);
      await mockTokenVault.mock.getDepositAmount.returns(100);
      await mockTokenVault.mock.transferFrom.returns(0);
      await mockTokenVault.mock['isCovered(address)'].returns(true);
      await mockReserveFund.mock.isPaused.returns(true);
      await mockCurrencyController.mock.convert.returns(100);
      await mockCurrencyController.mock.convertFromBaseCurrency.returns(1);
    });

    it("Liquidate less than 50% lending position in case the one position doesn't cover liquidation amount", async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      await lendingMarketControllerProxy
        .connect(signers[0])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(signers[1])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8001',
        );

      await lendingMarketControllerProxy
        .connect(signers[2])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        )
        .then((tx) => expect(tx).to.emit(fundManagementLogic, 'OrderFilled'));

      await lendingMarketControllerProxy
        .connect(alice)
        .executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          signers[0].address,
        )
        .then((tx) =>
          expect(tx)
            .to.emit(fundManagementLogic, 'LiquidationExecuted')
            .withArgs(
              signers[0].address,
              targetCurrency,
              targetCurrency,
              maturities[0],
              100,
            ),
        );
    });

    it('Liquidate 50% lending position in case the one position cover liquidation amount', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      await lendingMarketControllerProxy
        .connect(signers[3])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(signers[4])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8001',
        );

      await lendingMarketControllerProxy
        .connect(signers[5])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        )
        .then((tx) => expect(tx).to.emit(fundManagementLogic, 'OrderFilled'));

      await lendingMarketControllerProxy
        .connect(alice)
        .executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          signers[3].address,
        )
        .then((tx) =>
          expect(tx)
            .to.emit(fundManagementLogic, 'LiquidationExecuted')
            .withArgs(
              signers[3].address,
              targetCurrency,
              targetCurrency,
              maturities[0],
              100,
            ),
        );
    });

    it('Liquidate lending position using zero-coupon bonds', async () => {
      const orderAmount = ethers.BigNumber.from('100000000000000000');
      const orderRate = ethers.BigNumber.from('8000');

      // Set up for the mocks
      await mockTokenVault.mock.transferFrom.returns(100);

      await lendingMarketControllerProxy
        .connect(signers[0])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          orderAmount,
          orderRate,
        );

      await lendingMarketControllerProxy
        .connect(signers[1])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8001',
        );

      await lendingMarketControllerProxy
        .connect(signers[2])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        )
        .then((tx) => expect(tx).to.emit(fundManagementLogic, 'OrderFilled'));

      await lendingMarketControllerProxy
        .connect(alice)
        .executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          signers[0].address,
        )
        .then((tx) =>
          expect(tx)
            .to.emit(fundManagementLogic, 'LiquidationExecuted')
            .withArgs(
              signers[0].address,
              targetCurrency,
              targetCurrency,
              maturities[0],
              100,
            ),
        );
    });

    it('Fail to liquidate a lending position due to no debt', async () => {
      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[0].address,
          ),
      ).to.be.revertedWith('No debt in the selected maturity');
    });

    it('Fail to liquidate a lending position due to no liquidation amount', async () => {
      // Set up for the mocks
      await mockTokenVault.mock.getLiquidationAmount.returns(0, 0, 0);

      await lendingMarketControllerProxy
        .connect(signers[6])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(signers[7])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[6].address,
          ),
      ).to.be.revertedWith('User has enough collateral');
    });

    it('Fail to liquidate a lending position due to insufficient collateral', async () => {
      // Set up for the mocks
      await mockTokenVault.mock['isCovered(address)'].returns(false);

      await lendingMarketControllerProxy
        .connect(signers[6])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(signers[7])
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeLiquidationCall(
            targetCurrency,
            targetCurrency,
            maturities[0],
            signers[6].address,
          ),
      ).to.be.revertedWith('Invalid liquidation');
    });
  });
});
