import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { Side } from '../../../utils/constants';

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
  let dave: SignerWithAddress;
  let signers: SignerWithAddress[];

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

  before(async () => {
    [owner, alice, bob, carol, dave, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    ({ mockCurrencyController, mockTokenVault, lendingMarketControllerProxy } =
      await deployContracts(owner));

    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockCurrencyController.mock.getEthDecimals.returns(16);
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
    await mockCurrencyController.mock.getLastETHPrice.returns(10000000000);
    await mockCurrencyController.mock['convertToETH(bytes32,uint256)'].returns(
      20000000000,
    );
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
      await mockTokenVault.mock.getDepositAmount.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy.createLendingMarket(targetCurrency, '1'),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.depositAndCreateOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.createPreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.depositAndCreatePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1',
          '0',
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.unwindOrder(targetCurrency, maturities[0]),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.cancelOrder(
          targetCurrency,
          maturities[0],
          '1',
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.executeLiquidationCall(
          targetCurrency,
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.pauseLendingMarkets(targetCurrency),
      ).to.revertedWith('Already terminated');

      await expect(
        lendingMarketControllerProxy.unpauseLendingMarkets(targetCurrency),
      ).to.revertedWith('Already terminated');
    });

    it('Execute an emergency termination with orders', async () => {
      await mockTokenVault.mock.getDepositAmount.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(lendingMarket1, 'OrdersTaken');

      expect(
        await lendingMarketControllerProxy.getTotalPresentValue(
          targetCurrency,
          alice.address,
        ),
      ).to.equal('-50000000000000000');
      expect(
        await lendingMarketControllerProxy.getFutureValue(
          targetCurrency,
          maturities[0],
          alice.address,
        ),
      ).to.equal('-62500000000000000');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');

      for (const user of [alice, bob]) {
        await expect(
          lendingMarketControllerProxy
            .connect(user)
            .executeRedemption(targetCurrency, targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'RedemptionExecuted');

        expect(
          await lendingMarketControllerProxy.getTotalPresentValue(
            targetCurrency,
            user.address,
          ),
        ).to.equal('0');
        expect(
          await lendingMarketControllerProxy.getFutureValue(
            targetCurrency,
            maturities[0],
            user.address,
          ),
        ).to.equal('0');
      }
    });

    it('Execute an emergency termination with orders after auto-rolls', async () => {
      await mockTokenVault.mock.getDepositAmount.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(lendingMarket1, 'OrdersTaken');

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      expect(
        await lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          alice.address,
        ),
      ).not.to.equal('0');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');

      for (const user of [alice, bob]) {
        await expect(
          lendingMarketControllerProxy
            .connect(user)
            .executeRedemption(targetCurrency, targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'RedemptionExecuted');

        expect(
          await lendingMarketControllerProxy.getGenesisValue(
            targetCurrency,
            user.address,
          ),
        ).to.equal('0');
      }
    });

    it('Fail to redeem due to a insolvent user', async () => {
      await mockTokenVault.mock.getDepositAmount.returns('40000000000000000');
      await mockTokenVault.mock.isCollateral.returns(true);

      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(lendingMarket1, 'OrdersTaken');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeRedemption(targetCurrency, targetCurrency),
      ).to.revertedWith('Not enough collateral');
    });

    it('Fail to redeem due to non collateral currency', async () => {
      await mockTokenVault.mock.getDepositAmount.returns('50000000000000000');
      await mockTokenVault.mock.isCollateral.returns(false);

      const lendingMarket1 = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7999',
        );

      await expect(
        lendingMarketControllerProxy
          .connect(bob)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '0',
          ),
      ).to.emit(lendingMarket1, 'OrdersTaken');

      await expect(
        lendingMarketControllerProxy.executeEmergencyTermination(),
      ).to.emit(lendingMarketControllerProxy, 'EmergencyTerminationExecuted');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeRedemption(targetCurrency, targetCurrency),
      ).to.revertedWith('Not registered as collateral');
    });
  });
});
