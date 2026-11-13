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
import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');

const { deployContract } = waffle;

describe('LendingMarketController - Operations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let mockERC20: MockContract;
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

  const initialize = async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    ({
      mockERC20,
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
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock.canDepositCurrency.returns(true);
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockERC20.mock.decimals.returns(18);
  };

  const initializeCurrency = async (currency: string) => {
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

  const seedFutureValueVaultDebt = async (
    orderBookId: BigNumber,
    user: SignerWithAddress,
    futureValue: BigNumber,
    futureValueMaturity: BigNumber,
  ) => {
    const controllerAddress = lendingMarketControllerProxy.address;
    await ethers.provider.send('hardhat_setBalance', [
      controllerAddress,
      '0x1000000000000000000',
    ]);
    await ethers.provider.send('hardhat_impersonateAccount', [
      controllerAddress,
    ]);
    const controllerSigner = await ethers.getSigner(controllerAddress);

    try {
      await futureValueVaultProxy
        .connect(controllerSigner)
        .decrease(orderBookId, user.address, futureValue, futureValueMaturity);
    } finally {
      await ethers.provider.send('hardhat_stopImpersonatingAccount', [
        controllerAddress,
      ]);
    }
  };

  const seedFutureValueVaultLend = async (
    orderBookId: BigNumber,
    user: SignerWithAddress,
    futureValue: BigNumber,
    futureValueMaturity: BigNumber,
  ) => {
    const controllerAddress = lendingMarketControllerProxy.address;
    await ethers.provider.send('hardhat_setBalance', [
      controllerAddress,
      '0x1000000000000000000',
    ]);
    await ethers.provider.send('hardhat_impersonateAccount', [
      controllerAddress,
    ]);
    const controllerSigner = await ethers.getSigner(controllerAddress);

    try {
      await futureValueVaultProxy
        .connect(controllerSigner)
        .increase(orderBookId, user.address, futureValue, futureValueMaturity);
    } finally {
      await ethers.provider.send('hardhat_stopImpersonatingAccount', [
        controllerAddress,
      ]);
    }
  };

  beforeEach(async () => {
    if (currencyIdx % 5 === 0) {
      await initialize();
    }

    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    await initializeCurrency(targetCurrency);
  });

  describe('Operations', async () => {
    describe('Order books', async () => {
      it('Get the lending market detail with empty order book', async () => {
        const detail = await lendingMarketReader.getOrderBookDetail(
          targetCurrency,
          maturities[0],
        );

        expect(detail.bestLendUnitPrice).to.equal('10000');
        expect(detail.bestBorrowUnitPrice).to.equal('0');
        expect(detail.marketUnitPrice).to.equal('0');
        expect(detail.blockUnitPriceHistory[0]).to.equal('0');
        expect(detail.lastBlockUnitPriceTimestamp).to.equal('0');
        expect(detail.maxLendUnitPrice).to.equal('10000');
        expect(detail.minBorrowUnitPrice).to.equal('1');
        expect(detail.openingUnitPrice).to.equal('0');
        expect(detail.isReady).to.equal(true);

        const minDebtUnitPrice =
          await lendingMarketControllerProxy.getMinDebtUnitPrice(
            targetCurrency,
          );
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
            '9300',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9800',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9500',
          );

        const tx = await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9500',
          );

        await tx.wait();
        const { timestamp: lastBlockUnitPriceTimestamp } =
          await ethers.provider.getBlock(tx.blockNumber);

        await ethers.provider.send('evm_mine', []);

        const detail = await lendingMarketReader.getOrderBookDetail(
          targetCurrency,
          maturities[0],
        );

        expect(detail.bestLendUnitPrice).to.equal('9800');
        expect(detail.bestBorrowUnitPrice).to.equal('9300');
        expect(detail.marketUnitPrice).to.equal('9500');
        expect(detail.blockUnitPriceHistory[0]).to.equal('9500');
        expect(detail.lastBlockUnitPriceTimestamp).to.equal(
          lastBlockUnitPriceTimestamp,
        );
        expect(detail.maxLendUnitPrice).to.equal('10000');
        expect(detail.minBorrowUnitPrice).to.equal('9025');
        expect(detail.openingUnitPrice).to.equal('0');
        expect(detail.isReady).to.equal(true);

        const minDebtUnitPrice =
          await lendingMarketControllerProxy.getMinDebtUnitPrice(
            targetCurrency,
          );
        const { timestamp: latestTimestamp } = await ethers.provider.getBlock(
          'latest',
        );

        expect(detail.currentMinDebtUnitPrice).to.equal(
          BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE).sub(
            BigNumber.from(BASE_MIN_DEBT_UNIT_PRICE)
              .sub(minDebtUnitPrice)
              .mul(maturities[0].sub(latestTimestamp))
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
            '9300',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9800',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9500',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9500',
          );

        await ethers.provider.send('evm_mine', []);

        const details = await lendingMarketReader[
          'getOrderBookDetails(bytes32[])'
        ]([targetCurrency]);

        expect(details.length).to.equal(5);
        expect(details[0].bestLendUnitPrice).to.equal('9800');
        expect(details[0].bestBorrowUnitPrice).to.equal('9300');
        expect(details[0].marketUnitPrice).to.equal('9500');
        expect(details[0].maxLendUnitPrice).to.equal('10000');
        expect(details[0].minBorrowUnitPrice).to.equal('9025');
        expect(details[0].openingUnitPrice).to.equal('0');
        expect(details[0].isReady).to.equal(true);
      });
    });

    describe('Pause/Unpause', async () => {
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
              '9500',
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
            '9500',
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

        await lendingMarketControllerProxy.removeOperator(alice.address);

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
      });
    });

    describe('Protocol updates', async () => {
      it('Get the min debt unit price', async () => {
        const minDebtUnitPrice =
          await lendingMarketControllerProxy.getMinDebtUnitPrice(
            targetCurrency,
          );

        expect(minDebtUnitPrice).to.equal(MIN_DEBT_UNIT_PRICE);
      });

      it('Update the min debt unit price', async () => {
        const newMinDebtUnitPrice = '9580';

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          newMinDebtUnitPrice,
        );

        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPrice(
            targetCurrency,
          ),
        ).to.equal(newMinDebtUnitPrice);
      });

      it('Get the current min debt unit price', async () => {
        const currentMinDebtUnitPrice =
          await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
            targetCurrency,
            maturities[0],
          );
        const minDebtUnitPrice =
          await lendingMarketControllerProxy.getMinDebtUnitPrice(
            targetCurrency,
          );
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

      it('Calculates min debt prices at boundary and long-duration timestamps', async () => {
        const referenceTimestamp = 1000000000;

        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp + SECONDS_IN_YEAR * 2,
            referenceTimestamp,
          ),
        ).to.equal(6600);
        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp + SECONDS_IN_YEAR * 10,
            referenceTimestamp,
          ),
        ).to.equal(1);
        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp,
            referenceTimestamp,
          ),
        ).to.equal(BASE_MIN_DEBT_UNIT_PRICE);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          0,
        );
        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp + SECONDS_IN_YEAR,
            referenceTimestamp,
          ),
        ).to.equal(0);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          BASE_MIN_DEBT_UNIT_PRICE,
        );
        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp + SECONDS_IN_YEAR,
            referenceTimestamp,
          ),
        ).to.equal(BASE_MIN_DEBT_UNIT_PRICE);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          10000,
        );
        expect(
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            referenceTimestamp + SECONDS_IN_YEAR,
            referenceTimestamp,
          ),
        ).to.equal(BASE_MIN_DEBT_UNIT_PRICE);
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

      it('Update the minimum pre-order amount', async () => {
        const lendingMarketAddress =
          await lendingMarketControllerProxy.getLendingMarket(targetCurrency);
        const orderBookLogic = await ethers.getContractAt(
          'OrderBookLogic',
          lendingMarketAddress,
        );

        expect(
          await lendingMarketControllerProxy.getMinPreOrderAmount(
            targetCurrency,
          ),
        ).to.equal(0);

        await expect(
          lendingMarketControllerProxy.updateMinPreOrderAmount(
            targetCurrency,
            100,
          ),
        )
          .to.emit(orderBookLogic, 'MinPreOrderAmountUpdated')
          .withArgs(targetCurrency, 0, 100);

        expect(
          await lendingMarketControllerProxy.getMinPreOrderAmount(
            targetCurrency,
          ),
        ).to.equal(100);

        await expect(
          lendingMarketControllerProxy.updateMinPreOrderAmount(
            targetCurrency,
            0,
          ),
        )
          .to.emit(orderBookLogic, 'MinPreOrderAmountUpdated')
          .withArgs(targetCurrency, 100, 0);

        expect(
          await lendingMarketControllerProxy.getMinPreOrderAmount(
            targetCurrency,
          ),
        ).to.equal(0);
      });

      it('Rejects a minimum pre-order amount update from a non-owner', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .updateMinPreOrderAmount(targetCurrency, 100),
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('Update beacon proxy implementations and calculate Genesis value', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '50000000000000000',
            '9500',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9300',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '50000000000000000',
            '9500',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '9700',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '50000000000000000',
            '9500',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '9300',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '50000000000000000',
            '9500',
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            '9700',
          );

        const initialCF = await genesisValueVaultProxy.getLendingCompoundFactor(
          targetCurrency,
        );
        const gvDecimals = await genesisValueVaultProxy.decimals(
          targetCurrency,
        );
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
              '9500',
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
              '9500',
            ),
        ).to.be.revertedWith('MarketNotOpened');

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 2],
            Side.LEND,
            '100000000000000000',
            '9500',
          );

        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            newMaturities[newMaturities.length - 2],
            Side.BORROW,
            '100000000000000000',
            '9500',
          );

        const maturitiesBefore =
          await lendingMarketControllerProxy.getMaturities(targetCurrency);

        const aliceGVBefore = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
          0,
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

        const maturitiesAfter =
          await lendingMarketControllerProxy.getMaturities(targetCurrency);

        const aliceGVAfter = await genesisValueVaultProxy.getBalance(
          targetCurrency,
          alice.address,
          0,
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

      it('Fail to update the order fee rate due to execution by non-owner', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .updateOrderFeeRate(targetCurrency, 1),
        ).revertedWith('Ownable: caller is not the owner');
      });

      it('Fail to update the circuit breaker limit range due to execution by non-owner', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .updateCircuitBreakerLimitRange(targetCurrency, 1),
        ).revertedWith('Ownable: caller is not the owner');
      });

      it('Fail to update the min debt unit price due to execution by non-owner', async () => {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .updateMinDebtUnitPrice(targetCurrency, 1),
        ).revertedWith('Ownable: caller is not the owner');
      });

      it('Fail to update the min debt unit price due to invalid value', async () => {
        await expect(
          lendingMarketControllerProxy.updateMinDebtUnitPrice(
            targetCurrency,
            10001,
          ),
        ).revertedWith('InvalidMinDebtUnitPrice');
      });
    });

    describe('Order unit price ranges', async () => {
      it('Returns and enforces side-specific fallback ranges without a market price', async () => {
        const range = await lendingMarketControllerProxy.getOrderUnitPriceRange(
          targetCurrency,
          maturities[0],
        );
        const expectedReference =
          await lendingMarketControllerProxy.getMinDebtUnitPriceAt(
            targetCurrency,
            maturities[0],
            genesisDate,
          );
        const expectedMax = expectedReference.add(2000).gt(10000)
          ? BigNumber.from(10000)
          : expectedReference.add(2000);

        expect(range.minLendUnitPrice).to.equal(1);
        expect(range.maxLendUnitPrice).to.equal(expectedMax);
        expect(range.minBorrowUnitPrice).to.equal(expectedReference);
        expect(range.maxBorrowUnitPrice).to.equal(10000);
        expect(range.referenceUnitPrice).to.equal(expectedReference);
        expect(range.isMinDebtUnitPriceReference).to.equal(true);

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            range.minBorrowUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            range.maxLendUnitPrice,
          );

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              10001,
            ),
        ).to.be.reverted;
        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              range.maxLendUnitPrice.add(1),
            ),
        ).to.be.reverted;
      });

      it('Keeps the circuit breaker reference fixed until the block after a reliable fill', async () => {
        const marketUnitPrice = BigNumber.from(8500);
        const reliableAmount = MINIMUM_RELIABLE_AMOUNT;
        await mockCurrencyController.mock[
          'convertFromBaseCurrency(bytes32,uint256)'
        ].returns(reliableAmount);
        const lendingMarket = await lendingMarketControllerProxy
          .getLendingMarket(targetCurrency)
          .then((address) => ethers.getContractAt('LendingMarket', address));

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            reliableAmount,
            marketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            reliableAmount,
            marketUnitPrice,
          );

        await ethers.provider.send('evm_mine', []);

        const range = await lendingMarketControllerProxy.getOrderUnitPriceRange(
          targetCurrency,
          maturities[0],
        );
        expect(range.minLendUnitPrice).to.equal(1);
        expect(range.maxLendUnitPrice).to.equal(9350);
        expect(range.minBorrowUnitPrice).to.equal(8075);
        expect(range.maxBorrowUnitPrice).to.equal(10000);
        expect(range.referenceUnitPrice).to.equal(marketUnitPrice);
        expect(range.isMinDebtUnitPriceReference).to.equal(false);
        expect(
          await lendingMarket.getMarketUnitPrice(orderBookIds[0]),
        ).to.equal(marketUnitPrice);

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              reliableAmount,
              9351,
            ),
        ).to.be.reverted;
        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              reliableAmount,
              8074,
            ),
        ).to.be.reverted;

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            reliableAmount,
            9000,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            reliableAmount,
            9000,
          );

        expect(
          await lendingMarket.getMarketUnitPrice(orderBookIds[0]),
        ).to.equal(9000);

        const sameBlockThresholds =
          await lendingMarket.getCircuitBreakerThresholds(orderBookIds[0]);
        expect(sameBlockThresholds.referenceUnitPrice).to.equal(8500);
        expect(sameBlockThresholds.maxLendUnitPrice).to.equal(9350);
        expect(sameBlockThresholds.minBorrowUnitPrice).to.equal(8075);

        await ethers.provider.send('evm_mine', []);

        const nextBlockThresholds =
          await lendingMarket.getCircuitBreakerThresholds(orderBookIds[0]);
        expect(nextBlockThresholds.referenceUnitPrice).to.equal(8750);
        expect(nextBlockThresholds.maxLendUnitPrice).to.equal(9625);
        expect(nextBlockThresholds.minBorrowUnitPrice).to.equal(8313);
      });

      it('Keeps the unit price range when the circuit breaker range is wider', async () => {
        const marketUnitPrice = BigNumber.from(8000);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            marketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            marketUnitPrice,
          );

        await ethers.provider.send('evm_mine', []);
        await lendingMarketControllerProxy.updateCircuitBreakerLimitRange(
          targetCurrency,
          2000,
        );

        const range = await lendingMarketControllerProxy.getOrderUnitPriceRange(
          targetCurrency,
          maturities[0],
        );
        expect(range.referenceUnitPrice).to.equal(marketUnitPrice);
        expect(range.maxLendUnitPrice).to.equal(9000);
        expect(range.minBorrowUnitPrice).to.equal(7000);

        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.LEND,
              '100000000000000000',
              9001,
            ),
        ).to.be.reverted;
        await expect(
          lendingMarketControllerProxy
            .connect(carol)
            .executeOrder(
              targetCurrency,
              maturities[0],
              Side.BORROW,
              '100000000000000000',
              6999,
            ),
        ).to.be.reverted;
      });

      it('Clamps fallback and market-price ranges to valid unit price boundaries', async () => {
        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          0,
        );
        const zeroMinDebtRange =
          await lendingMarketControllerProxy.getOrderUnitPriceRange(
            targetCurrency,
            maturities[0],
          );
        expect(zeroMinDebtRange.referenceUnitPrice).to.equal(0);
        expect(zeroMinDebtRange.minLendUnitPrice).to.equal(1);
        expect(zeroMinDebtRange.maxLendUnitPrice).to.equal(10000);
        expect(zeroMinDebtRange.minBorrowUnitPrice).to.equal(1);
        expect(zeroMinDebtRange.maxBorrowUnitPrice).to.equal(10000);

        // When min debt price is disabled, high unit price orders (e.g., 9600 for ~1% APR) should be accepted
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            9600,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            9600,
          );

        await ethers.provider.send('evm_mine', []);

        const afterTradeRange =
          await lendingMarketControllerProxy.getOrderUnitPriceRange(
            targetCurrency,
            maturities[0],
          );
        expect(afterTradeRange.referenceUnitPrice).to.equal(9600);
        expect(afterTradeRange.minBorrowUnitPrice).to.equal(9120);
        expect(afterTradeRange.maxLendUnitPrice).to.equal(10000);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          10000,
        );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            10000,
          );
        await lendingMarketControllerProxy
          .connect(owner)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            10000,
          );

        await ethers.provider.send('evm_mine', []);

        const upperBoundaryRange =
          await lendingMarketControllerProxy.getOrderUnitPriceRange(
            targetCurrency,
            maturities[1],
          );
        expect(upperBoundaryRange.referenceUnitPrice).to.equal(10000);
        expect(upperBoundaryRange.maxLendUnitPrice).to.equal(10000);
        expect(upperBoundaryRange.minBorrowUnitPrice).to.equal(9500);
      });
    });

    describe('Calculation', async () => {
      it('Calculate the genesis value per maturity', async () => {
        // Keep the original exactly representable unit price available so this
        // test can continue checking supply conservation without rounding dust.
        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          '3000',
        );
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

        const cleanUpFunds = async () => {
          await lendingMarketControllerProxy.cleanUpFunds(
            targetCurrency,
            alice.address,
          );
          await lendingMarketControllerProxy.cleanUpFunds(
            targetCurrency,
            bob.address,
          );
          await lendingMarketControllerProxy.cleanUpFunds(
            targetCurrency,
            carol.address,
          );
          await lendingMarketControllerProxy.cleanUpFunds(
            targetCurrency,
            mockReserveFund.address,
          );
        };

        const checkGenesisValue = async (checkTotalSupply = false) => {
          const accounts = [alice, bob, carol, mockReserveFund];

          const genesisValues = await Promise.all(
            accounts.map(async (account) => {
              const { amount } =
                await lendingMarketControllerProxy.getGenesisValue(
                  targetCurrency,
                  account.address,
                );
              return amount;
            }),
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
              totalSupplies.reduce(
                (v, total) => total.add(v),
                BigNumber.from(0),
              ),
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
        await cleanUpFunds();

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
        await cleanUpFunds();
        await checkGenesisValue();
        await cleanUpFunds();
        await checkGenesisValue();

        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '10000',
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '100000000000000000',
            '10000',
          );

        await rotateOrderBooks();
        await cleanUpFunds();
        await checkGenesisValue();

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '200000000000000000',
            '10000',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '200000000000000000',
            '10000',
          );

        await rotateOrderBooks();
        await cleanUpFunds();
        await checkGenesisValue();

        await cleanUpFunds();
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
        expect(bobFunds.workingBorrowOrdersAmount).to.equal(
          '60000000000000000',
        );
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

        expect(aliceFunds.workingLendOrdersAmount).to.equal(
          '70000000000000000',
        );
        expect(aliceFunds.claimableAmount).to.gt(
          bobFunds.debtAmount.mul(9950).div(10000),
        );
        expect(aliceFunds.claimableAmount).to.lt(bobFunds.debtAmount);
        expect(bobFunds.workingBorrowOrdersAmount).to.equal('0');
        expect(bobFunds.debtAmount).to.equal('30000000000000000');
        expect(bobFunds.borrowedAmount).to.equal('30000000000000000');
      });

      it('Apply the source maturity debt floor when aggregating a non-default market position', async () => {
        const amount = BigNumber.from('100000000000000000');
        const sourceMarketUnitPrice = BigNumber.from(8000);

        // Set market prices before raising the debt floor so both books can trade normally.
        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );

        // Give the default market a reliable price above its debt floor. This isolates the
        // source-maturity floor from the existing destination-maturity floor.
        await lendingMarketControllerProxy
          .connect(owner)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            amount,
            BASE_MIN_DEBT_UNIT_PRICE,
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            amount,
            BASE_MIN_DEBT_UNIT_PRICE,
          );

        // Bob takes Alice's lend order, so Bob's debt is stored in FutureValueVault.
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            amount,
            sourceMarketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            amount,
            sourceMarketUnitPrice,
          );

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          8000,
        );

        const sourceMinDebtUnitPrice =
          await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
            targetCurrency,
            maturities[1],
          );

        const bobPosition = await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          bob.address,
        );
        const alicePosition = await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          alice.address,
        );
        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );
        const aliceFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        const expectedDebtAmount = bobPosition.futureValue
          .abs()
          .mul(sourceMinDebtUnitPrice)
          .div(10000);
        const expectedClaimableAmount = alicePosition.futureValue
          .mul(sourceMarketUnitPrice)
          .div(10000);

        expect(bobFunds.debtAmount.sub(expectedDebtAmount).abs()).to.lte(1);
        // The floor is debt-only and must not inflate lender collateral.
        expect(
          aliceFunds.claimableAmount.sub(expectedClaimableAmount).abs(),
        ).to.lte(1);
      });

      it('Do not replace the source maturity debt floor with the default maturity floor', async () => {
        const amount = BigNumber.from('100000000000000000');
        const marketUnitPrice = BigNumber.from(8000);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );

        // Establish both prices below their eventual floors. The source maturity owns the
        // position, so aggregation must use its floor rather than revalue it at the higher
        // default-maturity floor.
        await lendingMarketControllerProxy
          .connect(owner)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            amount,
            marketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            amount,
            marketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            amount,
            marketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            amount,
            marketUnitPrice,
          );

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          8000,
        );

        const sourceMinDebtUnitPrice =
          await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
            targetCurrency,
            maturities[1],
          );
        const defaultMinDebtUnitPrice =
          await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
            targetCurrency,
            maturities[0],
          );
        const bobPosition = await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          bob.address,
        );
        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );
        const expectedDebtAmount = bobPosition.futureValue
          .abs()
          .mul(sourceMinDebtUnitPrice)
          .div(10000);

        expect(defaultMinDebtUnitPrice).to.gt(sourceMinDebtUnitPrice);
        expect(sourceMinDebtUnitPrice).to.gt(marketUnitPrice);
        expect(bobFunds.debtAmount.sub(expectedDebtAmount).abs()).to.lte(1);
      });

      it('Apply the source maturity debt floor to a filled borrow order before cleanup', async () => {
        const amount = BigNumber.from('100000000000000000');
        const sourceMarketUnitPrice = BigNumber.from(8000);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );

        // Bob is the maker. Once Alice fills the order, Bob's debt remains in the inactive
        // borrow-order path until Bob's funds are cleaned up. The default market intentionally
        // has no price, ensuring its floor cannot reduce the source-maturity floor valuation.
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            amount,
            sourceMarketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            amount,
            sourceMarketUnitPrice,
          );

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          8000,
        );

        const sourceMinDebtUnitPrice =
          await lendingMarketControllerProxy.getCurrentMinDebtUnitPrice(
            targetCurrency,
            maturities[1],
          );

        const bobPosition = await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          bob.address,
        );
        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );
        const expectedDebtAmount = bobPosition.futureValue
          .abs()
          .mul(sourceMinDebtUnitPrice)
          .div(10000);

        expect(bobFunds.debtAmount.sub(expectedDebtAmount).abs()).to.lte(1);
      });

      it('Keep offsetting same-maturity positions unchanged by cleanup', async () => {
        const amount = BigNumber.from('100000000000000000');
        const sourceMarketUnitPrice = BigNumber.from(8000);

        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          3000,
        );

        // Bob's filled maker order remains in the inactive borrow-order path.
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            amount,
            sourceMarketUnitPrice,
          );
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            amount,
            sourceMarketUnitPrice,
          );

        const filledBorrowFutureValue = await lendingMarketControllerProxy
          .getPosition(targetCurrency, maturities[1], bob.address)
          .then((position) => position.futureValue.abs());

        // Add an equal lending FV in the same maturity. The economic position is zero both
        // before and after cleanup, even when the debt floor is above the market price.
        await seedFutureValueVaultLend(
          orderBookIds[1],
          bob,
          filledBorrowFutureValue,
          maturities[1],
        );
        await lendingMarketControllerProxy.updateMinDebtUnitPrice(
          targetCurrency,
          8000,
        );

        const beforeCleanup = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );
        const beforeCleanupPosition =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[1],
            bob.address,
          );

        await lendingMarketControllerProxy.cleanUpFunds(
          targetCurrency,
          bob.address,
        );

        const afterCleanup = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );
        const afterCleanupPosition =
          await lendingMarketControllerProxy.getPosition(
            targetCurrency,
            maturities[1],
            bob.address,
          );

        expect(beforeCleanupPosition.presentValue).to.equal(0);
        expect(beforeCleanup.claimableAmount).to.equal(0);
        expect(beforeCleanup.debtAmount).to.equal(0);
        expect(afterCleanupPosition.presentValue).to.equal(
          beforeCleanupPosition.presentValue,
        );
        expect(afterCleanup.claimableAmount).to.equal(
          beforeCleanup.claimableAmount,
        );
        expect(afterCleanup.debtAmount).to.equal(beforeCleanup.debtAmount);
      });

      it('Value debt at par when the source maturity has no established market price', async () => {
        const debtFutureValue = BigNumber.from('100000000000000000');

        // Register the source maturity for Bob without filling an order, leaving its market
        // unit price at zero.
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(targetCurrency, maturities[1], Side.LEND, 1, 8000);

        // Seed a pre-existing debt without executing a trade. This reproduces the zero-price
        // state handled by the legacy maturity-conversion path.
        await seedFutureValueVaultDebt(
          orderBookIds[1],
          bob,
          debtFutureValue,
          maturities[1],
        );

        expect(
          await lendingMarketReader
            .getOrderBookDetail(targetCurrency, maturities[1])
            .then((detail) => detail.marketUnitPrice),
        ).to.equal(0);

        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(bobFunds.debtAmount).to.equal(debtFutureValue);
      });

      it('Reject a non-zero FutureValueVault balance from a different maturity', async () => {
        const debtFutureValue = BigNumber.from('100000000000000000');

        // Register the maturity that FundManagementLogic will evaluate for Bob.
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(targetCurrency, maturities[1], Side.LEND, 1, 8000);

        // Seed the same order book with a non-zero balance tagged as another maturity.
        await seedFutureValueVaultDebt(
          orderBookIds[1],
          bob,
          debtFutureValue,
          maturities[2],
        );

        let revertData: string | undefined;
        try {
          await lendingMarketControllerProxy.calculateFunds(
            targetCurrency,
            bob.address,
            LIQUIDATION_THRESHOLD_RATE,
          );
        } catch (error) {
          revertData = (error as { data?: string }).data;
        }

        expect(revertData).to.equal(
          fundManagementLogic.interface.encodeErrorResult(
            'InvalidFutureValueMaturity',
            [orderBookIds[1], maturities[1], maturities[2]],
          ),
        );
      });

      it('Value default-maturity debt at par when no market price is established', async () => {
        const debtFutureValue = BigNumber.from('100000000000000000');

        // Register the default maturity for Bob without filling an order, leaving its market
        // unit price at zero.
        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(targetCurrency, maturities[0], Side.LEND, 1, 10000);

        await seedFutureValueVaultDebt(
          orderBookIds[0],
          bob,
          debtFutureValue,
          maturities[0],
        );

        expect(
          await lendingMarketReader
            .getOrderBookDetail(targetCurrency, maturities[0])
            .then((detail) => detail.marketUnitPrice),
        ).to.equal(0);

        const bobFunds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(bobFunds.debtAmount).to.equal(debtFutureValue);
      });

      it('Calculate the total funds with open orders less than min debt unit price', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '30000000000000000',
            '9500',
          );

        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9450',
          );

        await time.increaseTo(maturities[0].sub(3600).toString());

        const funds = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(funds.workingLendOrdersAmount).to.equal('100000000000000000');
        expect(
          funds.workingBorrowOrdersAmount
            .sub(
              calculateFutureValue('30000000000000000', '9500')
                .mul(BASE_MIN_DEBT_UNIT_PRICE)
                .div(10000),
            )
            .abs(),
        ).to.lte(1);

        await time.increaseTo(maturities[0].toString());

        const funds2 = await lendingMarketControllerProxy.calculateFunds(
          targetCurrency,
          alice.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(funds2.workingLendOrdersAmount).to.equal('0');
        expect(funds2.workingBorrowOrdersAmount).to.equal('0');
      });

      it('Calculate the total funds with position less than min debt unit price', async () => {
        await lendingMarketControllerProxy
          .connect(alice)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.BORROW,
            '30000000000000000',
            '9500',
          );

        await lendingMarketControllerProxy
          .connect(bob)
          .executeOrder(
            targetCurrency,
            maturities[0],
            Side.LEND,
            '100000000000000000',
            '9450',
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

        expect(
          aliceFunds.debtAmount
            .sub(
              calculateFutureValue('30000000000000000', '9500')
                .mul(BASE_MIN_DEBT_UNIT_PRICE)
                .div(10000),
            )
            .abs(),
        ).to.lte(1);
        expect(aliceFunds.borrowedAmount).to.equal('30000000000000000');

        expect(bobFunds.claimableAmount).to.equal('100000000000000000');
        expect(bobFunds.lentAmount).to.equal('100000000000000000');
      });
    });
  });
});
