import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { Side } from '../../../utils/constants';

import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
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
  let signers: SignerWithAddress[];

  const initialize = async (currency: string, openingDate = genesisDate) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
    );

    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(currency, openingDate);
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  before(async () => {
    [owner, alice, bob, carol, dave, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    ({
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

    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockCurrencyController.mock.getDecimals.returns(18);
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
    await mockCurrencyController.mock.getLastPrice.returns(
      '1000000000000000000',
    );
    await mockCurrencyController.mock[
      'convertToBaseCurrency(bytes32,uint256)'
    ].returns(20000000000);
    await mockTokenVault.mock.isCovered.returns(true);
    await mockTokenVault.mock.getCollateralCurrencies.returns([targetCurrency]);
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockERC20.mock.balanceOf.returns(1000000000);

    await initialize(targetCurrency);
  });

  describe('Terminations', async () => {
    it('Execute an emergency termination without an order', async () => {
      await mockTokenVault.mock.executeForcedReset.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy.createOrderBook(targetCurrency, '1'),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.depositAndExecuteOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.depositAndExecutesPreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.unwindPosition(
          targetCurrency,
          maturities[0],
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.cancelOrder(
          targetCurrency,
          maturities[0],
          '1',
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.pauseLendingMarkets(targetCurrency),
      ).to.revertedWith('AlreadyTerminated');

      await expect(
        lendingMarketControllerProxy.unpauseLendingMarkets(targetCurrency),
      ).to.revertedWith('AlreadyTerminated');
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

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

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

      expect(
        await lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          alice.address,
        ),
      ).not.to.equal('0');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');

      for (const user of [alice, bob]) {
        await expect(
          lendingMarketControllerProxy
            .connect(user)
            .executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        expect(
          await lendingMarketControllerProxy.getGenesisValue(
            targetCurrency,
            user.address,
          ),
        ).to.equal('0');
      }
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

    it('Fail to initialize the lending market due to the market being already initialized', async () => {
      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
        ),
      ).to.revertedWith('AlreadyInitialized');
    });

    it('Fail to execute an emergency termination due to no markets terminated', async () => {
      await expect(
        lendingMarketControllerProxy.connect(bob).executeEmergencySettlement(),
      ).to.revertedWith('NotTerminated');
    });
  });
});
