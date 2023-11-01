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
  BASE_MIN_DEBT_UNIT_PRICE,
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_THRESHOLD_RATE,
  MINIMUM_RELIABLE_AMOUNT,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
  SECONDS_IN_YEAR,
} from '../../common/constants';
import { deployContracts } from './utils';

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');

const { deployContract } = waffle;

describe('LendingMarketController - Operations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let beaconProxyControllerProxy: Contract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;
  let futureValueVaultProxy: Contract;
  let lendingMarketReader: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

  let maturities: BigNumber[];
  let orderBookIds: BigNumber[];
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

    await initialize(targetCurrency);
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
      lendingMarketReader,
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
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
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
      CIRCUIT_BREAKER_LIMIT_RANGE,
      MIN_DEBT_UNIT_PRICE,
    );
    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        currency,
        genesisDate,
        genesisDate,
      );
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
    orderBookIds = await lendingMarketControllerProxy.getOrderBookIds(
      targetCurrency,
    );

    futureValueVaultProxy = await lendingMarketControllerProxy
      .getFutureValueVault(targetCurrency)
      .then((address) => ethers.getContractAt('FutureValueVault', address));
  };

  describe('Operations', async () => {
    it('Get the min debt unit price', async () => {
      const minDebtUnitPrice =
        await lendingMarketControllerProxy.getMinDebtUnitPrice(targetCurrency);

      expect(minDebtUnitPrice).to.equal('8100');
    });

    it('Update the min debt unit price', async () => {
      const newMinDebtUnitPrice = '8400';

      await lendingMarketControllerProxy.updateMinDebtUnitPrice(
        targetCurrency,
        newMinDebtUnitPrice,
      );

      expect(
        await lendingMarketControllerProxy.getMinDebtUnitPrice(targetCurrency),
      ).to.equal(newMinDebtUnitPrice);
    });

    it('Get the current min debt unit price', async () => {
      const currentMinDebtUnitPrice =
        await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
          targetCurrency,
          maturities[0],
        );
      const minDebtUnitPrice =
        await lendingMarketControllerProxy.getMinDebtUnitPrice(targetCurrency);
      const { timestamp } = await ethers.provider.getBlock('latest');

      expect(currentMinDebtUnitPrice).to.equal(
        BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE).sub(
          BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE)
            .sub(minDebtUnitPrice)
            .mul(maturities[0].sub(timestamp))
            .div(SECONDS_IN_YEAR),
        ),
      );
    });

    it('Get the lending market detail with empty order book', async () => {
      const detail = await lendingMarketReader.getOrderBookDetail(
        targetCurrency,
        maturities[0],
      );

      expect(detail.bestLendUnitPrice).to.equal('10000');
      expect(detail.bestBorrowUnitPrice).to.equal('0');
      expect(detail.marketUnitPrice).to.equal('0');
      expect(detail.lastOrderBlockNumber).to.equal('0');
      expect(detail.blockUnitPriceHistory[0]).to.equal('0');
      expect(detail.maxLendUnitPrice).to.equal('10000');
      expect(detail.minBorrowUnitPrice).to.equal('1');
      expect(detail.openingUnitPrice).to.equal('0');
      expect(detail.isReady).to.equal(true);

      const minDebtUnitPrice =
        await lendingMarketControllerProxy.getMinDebtUnitPrice(targetCurrency);
      const { timestamp } = await ethers.provider.getBlock('latest');

      expect(detail.currentMinDebtUnitPrice).to.equal(
        BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE).sub(
          BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE)
            .sub(minDebtUnitPrice)
            .mul(maturities[0].sub(timestamp))
            .div(SECONDS_IN_YEAR),
        ),
      );
    });

    it('Get the lending market detail with non-empty order book', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '5000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      const tx = await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await ethers.provider.send('evm_mine', []);

      const detail = await lendingMarketReader.getOrderBookDetail(
        targetCurrency,
        maturities[0],
      );

      expect(detail.bestLendUnitPrice).to.equal('9000');
      expect(detail.bestBorrowUnitPrice).to.equal('5000');
      expect(detail.marketUnitPrice).to.equal('8000');
      expect(detail.lastOrderBlockNumber).to.equal(tx.blockNumber);
      expect(detail.blockUnitPriceHistory[0]).to.equal('8000');
      expect(detail.maxLendUnitPrice).to.equal('8800');
      expect(detail.minBorrowUnitPrice).to.equal('7600');
      expect(detail.openingUnitPrice).to.equal('0');
      expect(detail.isReady).to.equal(true);

      const minDebtUnitPrice =
        await lendingMarketControllerProxy.getMinDebtUnitPrice(targetCurrency);
      const { timestamp } = await ethers.provider.getBlock('latest');

      expect(detail.currentMinDebtUnitPrice).to.equal(
        BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE).sub(
          BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE)
            .sub(minDebtUnitPrice)
            .mul(maturities[0].sub(timestamp))
            .div(SECONDS_IN_YEAR),
        ),
      );
    });

    it('Get the multiple lending market details', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '5000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await ethers.provider.send('evm_mine', []);

      const details = await lendingMarketReader[
        'getOrderBookDetails(bytes32[])'
      ]([targetCurrency]);

      expect(details.length).to.equal(5);
      expect(details[0].bestLendUnitPrice).to.equal('9000');
      expect(details[0].bestBorrowUnitPrice).to.equal('5000');
      expect(details[0].marketUnitPrice).to.equal('8000');
      expect(details[0].maxLendUnitPrice).to.equal('8800');
      expect(details[0].minBorrowUnitPrice).to.equal('7600');
      expect(details[0].openingUnitPrice).to.equal('0');
      expect(details[0].isReady).to.equal(true);
    });

    it('Pause lending markets', async () => {
      await lendingMarketControllerProxy.pauseLendingMarket(targetCurrency);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Pausable: paused');

      await lendingMarketControllerProxy.unpauseLendingMarket(targetCurrency);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
    });

    it('Change the operator', async () => {
      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .pauseLendingMarket(targetCurrency),
      ).to.be.revertedWith('CallerNotOperator');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .unpauseLendingMarket(targetCurrency),
      ).to.be.revertedWith('CallerNotOperator');

      await lendingMarketControllerProxy.addOperator(alice.address);
      await lendingMarketControllerProxy.removeOperator(owner.address);

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .pauseLendingMarket(targetCurrency),
      ).to.be.revertedWith('CallerNotOperator');

      await expect(
        lendingMarketControllerProxy
          .connect(owner)
          .unpauseLendingMarket(targetCurrency),
      ).to.be.revertedWith('CallerNotOperator');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .pauseLendingMarket(targetCurrency),
      ).to.be.not.reverted;

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .unpauseLendingMarket(targetCurrency),
      ).to.be.not.reverted;
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

    it('Update the circuit breaker limit range', async () => {
      expect(
        await lendingMarketControllerProxy.getCircuitBreakerLimitRange(
          targetCurrency,
        ),
      ).to.equal(CIRCUIT_BREAKER_LIMIT_RANGE);

      await lendingMarketControllerProxy.updateCircuitBreakerLimitRange(
        targetCurrency,
        '500',
      );

      expect(
        await lendingMarketControllerProxy.getCircuitBreakerLimitRange(
          targetCurrency,
        ),
      ).to.equal('500');

      await lendingMarketControllerProxy.updateCircuitBreakerLimitRange(
        targetCurrency,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );

      expect(
        await lendingMarketControllerProxy.getCircuitBreakerLimitRange(
          targetCurrency,
        ),
      ).to.equal(CIRCUIT_BREAKER_LIMIT_RANGE);
    });

    it('Update beacon proxy implementations and calculate Genesis value', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7200',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8800',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '7200',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
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
      const [aliceInitialFV] = await futureValueVaultProxy.getBalance(
        orderBookIds[0],
        alice.address,
      );
      // Use bignumber.js to round off the result
      const aliceExpectedGV = BigNumberJS(aliceInitialFV.toString())
        .times(BigNumberJS('10').pow(gvDecimals.toString()))
        .div(initialCF.toString())
        .dp(0);

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);
      const newMaturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('MarketNotOpened');

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 1],
            Side.LEND,
            '100000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('MarketNotOpened');

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          newMaturities[newMaturities.length - 2],
          Side.LEND,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          newMaturities[newMaturities.length - 2],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      const maturitiesBefore = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVBefore = await genesisValueVaultProxy.getBalance(
        targetCurrency,
        alice.address,
      );

      // Update implementations
      const orderReaderLogic = await deployContract(owner, OrderReaderLogic);
      const orderBookLogic = await deployContract(owner, OrderBookLogic);

      const orderActionLogic = await ethers
        .getContractFactory('OrderActionLogic', {
          libraries: {
            OrderReaderLogic: orderReaderLogic.address,
          },
        })
        .then((factory) => factory.deploy());

      const lendingMarket = await ethers
        .getContractFactory('LendingMarket', {
          libraries: {
            OrderActionLogic: orderActionLogic.address,
            OrderReaderLogic: orderReaderLogic.address,
            OrderBookLogic: orderBookLogic.address,
          },
        })
        .then((factory) => factory.deploy(MINIMUM_RELIABLE_AMOUNT));
      await beaconProxyControllerProxy.setLendingMarketImpl(
        lendingMarket.address,
      );

      const maturitiesAfter = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const aliceGVAfter = await genesisValueVaultProxy.getBalance(
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

      const rotateOrderBooks = async () => {
        await time.increaseTo(maturities[0].toString());
        await expect(
          lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
        ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

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
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      const tx = await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

      await rotateOrderBooks();
      await checkGenesisValue();
      await cleanUpAllFunds();
      await checkGenesisValue();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await rotateOrderBooks();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '200000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '200000000000000000',
          '8000',
        );

      await rotateOrderBooks();
      await cleanUpAllFunds();
      await checkGenesisValue();

      await cleanUpAllFunds();
      await checkGenesisValue(true);
    });

    it('Calculate the total funds from inactive lending order list', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '40000000000000000',
          '9600',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '9600',
        );

      await ethers.provider.send('evm_mine', []);

      const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        alice.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      const bobFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        bob.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      expect(aliceFunds.workingLendOrdersAmount).to.equal('0');
      expect(aliceFunds.claimableAmount).to.equal('40000000000000000');
      expect(bobFunds.workingBorrowOrdersAmount).to.equal('60000000000000000');
      expect(bobFunds.debtAmount).gt('40000000000000000');
      expect(bobFunds.borrowedAmount).to.equal('0');
    });

    it('Calculate the total funds from inactive borrowing order list', async () => {
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '30000000000000000',
          '9600',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '9600',
        );

      await ethers.provider.send('evm_mine', []);

      const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        alice.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      const bobFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        bob.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      expect(aliceFunds.workingLendOrdersAmount).to.equal('70000000000000000');
      expect(aliceFunds.claimableAmount).to.gt(
        bobFunds.debtAmount.mul(9950).div(10000),
      );
      expect(aliceFunds.claimableAmount).to.lt(bobFunds.debtAmount);
      expect(bobFunds.workingBorrowOrdersAmount).to.equal('0');
      expect(bobFunds.debtAmount).to.equal('30000000000000000');
      expect(bobFunds.borrowedAmount).to.equal('30000000000000000');
    });

    it('Calculate the total funds with open orders less than min debt unit price', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '30000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7900',
        );

      await time.increaseTo(maturities[0].toString());

      const { workingLendOrdersAmount, workingBorrowOrdersAmount } =
        await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

      expect(workingLendOrdersAmount).to.equal('100000000000000000');
      expect(workingBorrowOrdersAmount).to.equal('36000000000000000');
    });

    it('Calculate the total funds with position less than min debt unit price', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '30000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7900',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '30000000000000000',
          '0',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '0',
        );

      await time.increaseTo(maturities[0].toString());

      const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        alice.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      const bobFunds = await lendingMarketControllerProxy.calculateFunds(
        targetCurrency,
        bob.address,
        LIQUIDATION_THRESHOLD_RATE,
      );

      expect(aliceFunds.debtAmount).to.equal('36000000000000000');
      expect(aliceFunds.borrowedAmount).to.equal('30000000000000000');

      expect(bobFunds.claimableAmount).to.equal('100000000000000000');
      expect(bobFunds.lentAmount).to.equal('100000000000000000');
    });
  });
});
