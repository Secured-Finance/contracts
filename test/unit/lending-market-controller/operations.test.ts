import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
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

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');

const { deployContract } = waffle;

describe('LendingMarketController - Operations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;
  let lendingMarketProxies: Contract[];
  let futureValueVaultProxies: Contract[];

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ellen, ...signers] =
      await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      beaconProxyControllerProxy,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
    } = await deployContracts(owner));

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.isCovered.returns(true);
  });

  const initialize = async (currency: string) => {
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

    futureValueVaultProxies = await Promise.all(
      maturities.map((maturity) =>
        lendingMarketControllerProxy
          .getFutureValueVault(currency, maturity)
          .then((address) => ethers.getContractAt('FutureValueVault', address)),
      ),
    );
  };

  beforeEach(async () => {
    await initialize(targetCurrency);
  });

  describe('Operations', async () => {
    it('Pause lending markets', async () => {
      await lendingMarketControllerProxy.pauseLendingMarkets(targetCurrency);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            0,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Pausable: paused');

      await lendingMarketControllerProxy.unpauseLendingMarkets(targetCurrency);

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          0,
          '100000000000000000',
          '8000',
        );
    });

    it('Update the order fee rate', async () => {
      expect(
        await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
      ).to.equal(ORDER_FEE_RATE);

      await lendingMarketControllerProxy.updateOrderFeeRate(
        targetCurrency,
        '200',
      );

      expect(
        await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
      ).to.equal('200');

      await lendingMarketControllerProxy.updateOrderFeeRate(
        targetCurrency,
        ORDER_FEE_RATE,
      );

      expect(
        await lendingMarketControllerProxy.getOrderFeeRate(targetCurrency),
      ).to.equal(ORDER_FEE_RATE);
    });

    it('Update beacon proxy implementations and calculate Genesis value', async () => {
      const futureValueVault1 = futureValueVaultProxies[0];

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7200',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8800',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '7200',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8800',
        );

      const initialCF = await genesisValueVaultProxy.getLendingCompoundFactor(
        targetCurrency,
      );
      const gvDecimals = await genesisValueVaultProxy.decimals(targetCurrency);
      const [aliceInitialFV] = await futureValueVault1.getFutureValue(
        alice.address,
      );
      // Use bignumber.js to round off the result
      const aliceExpectedGV = BigNumberJS(aliceInitialFV.toString())
        .times(BigNumberJS('10').pow(gvDecimals.toString()))
        .div(initialCF.toString())
        .dp(0);

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);
      const newMaturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Market is not opened');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .createOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 1],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Market is not opened');

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          newMaturities[newMaturities.length - 2],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          newMaturities[newMaturities.length - 2],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      const maturitiesBefore = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVBefore = await genesisValueVaultProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );

      // Update implementations
      const orderBookLogic = await deployContract(owner, OrderBookLogic);
      const lendingMarket = await ethers
        .getContractFactory('LendingMarket', {
          libraries: {
            OrderBookLogic: orderBookLogic.address,
          },
        })
        .then((factory) => factory.deploy());
      await beaconProxyControllerProxy.setLendingMarketImpl(
        lendingMarket.address,
      );

      const maturitiesAfter = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVAfter = await genesisValueVaultProxy.getGenesisValue(
        targetCurrency,
        alice.address,
      );

      for (let i = 0; i < maturitiesBefore.length; i++) {
        expect(maturitiesBefore[i].toString()).to.equal(
          maturitiesAfter[i].toString(),
        );
      }

      expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
      expect(aliceGVBefore.toString()).to.equal(aliceGVAfter.toString());
      expect(aliceGVBefore.toString()).to.equal(aliceExpectedGV.toFixed());
    });

    it('Calculate the genesis value per maturity', async () => {
      maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const rotateLendingMarkets = async () => {
        await time.increaseTo(maturities[0].toString());
        await expect(
          lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
        ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

        maturities = await lendingMarketControllerProxy.getMaturities(
          targetCurrency,
        );
      };

      const cleanUpAllFunds = async () => {
        await lendingMarketControllerProxy.cleanUpAllFunds(alice.address);
        await lendingMarketControllerProxy.cleanUpAllFunds(bob.address);
        await lendingMarketControllerProxy.cleanUpAllFunds(carol.address);
        await lendingMarketControllerProxy.cleanUpAllFunds(
          mockReserveFund.address,
        );
      };

      const checkGenesisValue = async (checkTotalSupply = false) => {
        const accounts = [alice, bob, carol, mockReserveFund];

        const genesisValues = await Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getGenesisValue(
              targetCurrency,
              account.address,
            ),
          ),
        );

        const totalSupplies = await Promise.all([
          genesisValueVaultProxy.getTotalLendingSupply(targetCurrency),
          genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency),
        ]);

        console.table({
          GenesisValue: {
            Alice: genesisValues[0].toString(),
            Bob: genesisValues[1].toString(),
            Carol: genesisValues[2].toString(),
            ReserveFund: genesisValues[3].toString(),
            TotalLendingSupply: totalSupplies[0].toString(),
            TotalBorrowingSupply: totalSupplies[1].toString(),
          },
        });

        if (checkTotalSupply) {
          expect(
            totalSupplies.reduce((v, total) => total.add(v), BigNumber.from(0)),
          ).to.equal(
            genesisValues.reduce(
              (v, total) => total.abs().add(v),
              BigNumber.from(0),
            ),
          );

          expect(totalSupplies[0]).to.equal(totalSupplies[1]);
        }
      };

      await checkGenesisValue();
      await cleanUpAllFunds();

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '7900',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8100',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      const tx = await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      const lendingMarket1 = lendingMarketProxies[0];
      await expect(tx).to.emit(lendingMarket1, 'OrdersTaken');

      await rotateLendingMarkets();
      await checkGenesisValue();
      await cleanUpAllFunds();
      await checkGenesisValue();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '80000000000000000',
          '7900',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '80000000000000000',
          '8100',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await rotateLendingMarkets();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '200000000000000000',
          '7900',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '200000000000000000',
          '8100',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8000',
        );

      await rotateLendingMarkets();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await cleanUpAllFunds();
      await checkGenesisValue(true);
    });

    it('Calculate the total funds from inactive lending order list', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '40000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '7500',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '500000000000000000',
          '7499',
        );

      const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        alice.address,
      );

      const bobFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        bob.address,
      );

      expect(aliceFunds.workingLendOrdersAmount).to.equal('0');
      expect(aliceFunds.claimableAmount).to.equal('37500000000000000');
      expect(bobFunds.workingBorrowOrdersAmount).to.equal('60000000000000000');
      expect(bobFunds.debtAmount).gt('37500000000000000');
      expect(bobFunds.borrowedAmount).to.equal('0');
    });

    it('Calculate the total funds from inactive borrowing order list', async () => {
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '30000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '500000000000000000',
          '8150',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '500000000000000000',
          '8149',
        );

      const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        alice.address,
      );

      const bobFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        bob.address,
      );

      expect(aliceFunds.workingLendOrdersAmount).to.equal('70000000000000000');
      expect(aliceFunds.claimableAmount).to.gt(
        bobFunds.debtAmount.mul(9950).div(10000),
      );
      expect(aliceFunds.claimableAmount).to.lt(bobFunds.debtAmount);
      expect(bobFunds.workingBorrowOrdersAmount).to.equal('0');
      expect(bobFunds.debtAmount).to.equal('30562500000000000');
      expect(bobFunds.borrowedAmount).to.equal('30000000000000000');
    });
  });
});