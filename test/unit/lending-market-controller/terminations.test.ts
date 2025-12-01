import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import { Side } from '../../../utils/constants';

import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { deployContracts } from './utils';

describe('LendingMarketController - Terminations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockERC20: MockContract;
  let lendingMarketControllerProxy: Contract;

  let lendingMarketOperationLogic: Contract;
  let fundManagementLogic: Contract;

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  const initialize = async (currency: string, openingDate = genesisDate) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      MIN_DEBT_UNIT_PRICE,
    );

    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        currency,
        openingDate,
        openingDate,
      );
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  before(async () => {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    ({
      mockERC20,
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      lendingMarketOperationLogic,
      fundManagementLogic,
    } = await deployContracts(owner));

    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );
    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.getDecimals.returns(18);
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
    await mockCurrencyController.mock.getAggregatedLastPrice.returns(
      '1000000000000000000',
    );
    await mockCurrencyController.mock[
      'convertToBaseCurrency(bytes32,uint256)'
    ].returns('20000000000');
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock.getCollateralCurrencies.returns([targetCurrency]);
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockERC20.mock.balanceOf.returns(1000000000);
    await mockERC20.mock.decimals.returns(18);

    await initialize(targetCurrency);
  });

  describe('Terminations', async () => {
    it('Get the termination status', async () => {
      const [
        isTerminated,
        terminationDate,
        terminationCurrencyCache,
        terminationCollateralRatio,
      ] = await Promise.all([
        lendingMarketControllerProxy.isTerminated(),
        lendingMarketControllerProxy.getTerminationDate(),
        lendingMarketControllerProxy.getTerminationCurrencyCache(
          targetCurrency,
        ),
        lendingMarketControllerProxy.getTerminationCollateralRatio(
          targetCurrency,
        ),
      ]);

      expect(isTerminated).to.equal(false);
      expect(terminationDate).to.equal(0);
      expect(terminationCurrencyCache.price).to.equal(0);
      expect(terminationCurrencyCache.decimals).to.equal(0);
      expect(terminationCollateralRatio).to.equal(0);
    });

    it('Execute an emergency termination without an order and check all inactivated functions', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy.createOrderBook(targetCurrency, '1', '1'),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.depositAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.depositWithPermitAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
          ethers.constants.MaxUint256,
          1,
          ethers.utils.formatBytes32String('dummy'),
          ethers.utils.formatBytes32String('dummy'),
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.depositAndExecutesPreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.depositWithPermitAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
          ethers.constants.MaxUint256,
          1,
          ethers.utils.formatBytes32String('dummy'),
          ethers.utils.formatBytes32String('dummy'),
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.unwindPosition(
          targetCurrency,
          maturities[0],
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.unwindPositionWithCap(
          targetCurrency,
          maturities[0],
          '1',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeRedemption(
          targetCurrency,
          maturities[0],
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeRepayment(
          targetCurrency,
          maturities[0],
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.cancelOrder(
          targetCurrency,
          maturities[0],
          '1',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeItayoseCall(
          targetCurrency,
          maturities[0],
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeForcedRepayment(
          targetCurrency,
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          '1',
        ),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.pauseLendingMarket(targetCurrency),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.unpauseLendingMarket(targetCurrency),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.withdrawZCToken(targetCurrency, '1', '1'),
      ).to.revertedWith('MarketTerminated');

      await expect(
        lendingMarketControllerProxy.depositZCToken(targetCurrency, '1', '1'),
      ).to.not.revertedWith('MarketTerminated');
    });

    it('Execute an emergency termination with orders of single market', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketControllerProxy
        .getPosition(targetCurrency, maturities[0], alice.address)
        .then(({ futureValue, presentValue }) => {
          expect(futureValue).to.equal('-62500000000000000');
          expect(presentValue).to.equal('-50000000000000000');
        });

      const tx =
        await lendingMarketControllerProxy.executeEmergencyTermination();

      await expect(tx).to.emit(
        lendingMarketOperationLogic,
        'EmergencyTerminationExecuted',
      );

      for (const user of [alice, bob]) {
        await expect(
          lendingMarketControllerProxy
            .connect(user)
            .executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        const { futureValue, presentValue } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            user.address,
          );

        expect(futureValue).to.equal('0');
        expect(presentValue).to.equal('0');
      }

      const [
        isTerminated,
        terminationDate,
        terminationCurrencyCache,
        terminationCollateralRatio,
      ] = await Promise.all([
        lendingMarketControllerProxy.isTerminated(),
        lendingMarketControllerProxy.getTerminationDate(),
        lendingMarketControllerProxy.getTerminationCurrencyCache(
          targetCurrency,
        ),
        lendingMarketControllerProxy.getTerminationCollateralRatio(
          targetCurrency,
        ),
      ]);

      const { timestamp } = await ethers.provider.getBlock(tx.blockNumber);

      expect(isTerminated).to.equal(true);
      expect(terminationDate).to.equal(timestamp);
      expect(terminationCurrencyCache.price).to.equal('1000000000000000000');
      expect(terminationCurrencyCache.decimals).to.equal(18);
      expect(terminationCollateralRatio).to.equal('20000000000');
    });

    it('Execute an emergency termination with orders of multiple markets', async () => {
      await mockTokenVault.mock.executeForcedReset.returns(
        '150000000000000000',
      );
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const targetCurrency2 = ethers.utils.formatBytes32String(`TestCurrency2`);
      await initialize(targetCurrency2);
      await mockCurrencyController.mock.getCurrencies.returns([
        targetCurrency,
        targetCurrency2,
      ]);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency2,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency2,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '8000',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      const position1 = await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturities[0],
        alice.address,
      );
      const position2 = await lendingMarketControllerProxy.getPosition(
        targetCurrency2,
        maturities[0],
        alice.address,
      );

      expect(position1.presentValue).to.equal('-50000000000000000');
      expect(position1.futureValue).to.equal('-62500000000000000');
      expect(position2.presentValue).to.equal('100000000000000000');
      expect(position2.futureValue).to.equal('125000000000000000');

      expect(
        await lendingMarketControllerProxy.isRedemptionRequired(bob.address),
      ).to.equal(false);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      expect(
        await lendingMarketControllerProxy.isRedemptionRequired(bob.address),
      ).to.equal(true);

      await expect(
        lendingMarketControllerProxy.connect(bob).executeEmergencySettlement(),
      ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

      expect(
        await lendingMarketControllerProxy.isRedemptionRequired(bob.address),
      ).to.equal(false);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeEmergencySettlement(),
      )
        .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
        .withArgs(alice.address, '200000000000000000');

      for (const user of [alice, bob]) {
        const { futureValue, presentValue } =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[0],
            user.address,
          );

        expect(futureValue).to.equal('0');
        expect(presentValue).to.equal('0');
      }
    });

    it('Execute an emergency termination with orders after auto-rolls', async () => {
      await mockTokenVault.mock.executeForcedReset.returns(
        '100000000000000000',
      );
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const { amount } = await lendingMarketControllerProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );
      expect(amount).not.to.equal('0');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      for (const user of [alice, bob]) {
        await expect(
          lendingMarketControllerProxy
            .connect(user)
            .executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        const { amount } = await lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          user.address,
        );
        expect(amount).to.equal('0');
      }
    });

    it('Execute an emergency termination with paused markets', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy.pauseLendingMarket(targetCurrency);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
    });

    it('Fail to redeem due to a insolvent user', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('40000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeEmergencySettlement(),
      ).to.revertedWith('InsufficientCollateral');
    });

    it('Fail to redeem due to 2nd execution', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeEmergencySettlement(),
      ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeEmergencySettlement(),
      ).to.revertedWith('AlreadyRedeemed');
    });

    it('Fail to execute the emergency termination due to execution by non-owner', async () => {
      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeEmergencyTermination(),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to initialize the lending market due to the market being already initialized', async () => {
      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        ),
      ).to.revertedWith('AlreadyInitialized');
    });

    it('Fail to execute the emergency settlement due to no markets terminated', async () => {
      await expect(
        lendingMarketControllerProxy.connect(bob).executeEmergencySettlement(),
      ).to.revertedWith('NotTerminated');
    });
  });
});
