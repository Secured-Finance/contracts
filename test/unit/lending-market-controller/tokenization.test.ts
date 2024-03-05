import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { MockContract, deployMockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers } from 'hardhat';

import { expect } from 'chai';
import moment from 'moment';
import { Side } from '../../../utils/constants';
import { getGenesisDate, getLastFriday } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  HAIRCUT,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_THRESHOLD_RATE,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
  PCT_DIGIT,
} from '../../common/constants';
import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

const MockERC20 = artifacts.require('MockERC20');

describe('LendingMarketController - Tokenization', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockERC20: MockContract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

  let maturities: BigNumber[];
  let targetCurrencyName: string;
  let targetCurrencySymbol: string;
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  before(async () => {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
      fundManagementLogic,
      lendingMarketOperationLogic,
    } = await deployContracts(owner));

    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );
    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(HAIRCUT);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.cleanUpUsedCurrencies.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock['isCollateral(bytes32[])'].returns([true]);
    await mockTokenVault.mock.calculateCoverage.returns('1000', false);
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockTokenVault.mock.getLiquidationThresholdRate.returns('12500');
    await mockTokenVault.mock.getCollateralDetail.returns(2, 1, 1);
    await mockERC20.mock.decimals.returns(6);
  });

  beforeEach(async () => {
    targetCurrencyName = `Test ${currencyIdx}`;
    targetCurrencySymbol = `Test${currencyIdx}`;
    targetCurrency = ethers.utils.formatBytes32String(targetCurrencySymbol);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);

    await mockERC20.mock.name.returns(targetCurrencyName);
    await mockERC20.mock.symbol.returns(targetCurrencySymbol);
  });

  const initialize = async (currency: string, marketCount = 4) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      0,
    );
    for (let i = 0; i < marketCount; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        currency,
        genesisDate,
        genesisDate,
      );
    }

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  describe('Token Deployments', async () => {
    it('Create a new zc perpetual token', async () => {
      const tokenName = `ZC ${targetCurrencyName}`;
      const tokenSymbol = `zc${targetCurrencySymbol}`;

      await expect(
        lendingMarketControllerProxy.initializeLendingMarket(
          targetCurrency,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        ),
      )
        .to.emit(lendingMarketOperationLogic, 'ZCTokenCreated')
        .withArgs(targetCurrency, 0, tokenName, tokenSymbol, 24, () => true);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcTokenInfo = await lendingMarketControllerProxy.getZCTokenInfo(
        zcTokenAddress,
      );

      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      expect(zcTokenAddress).to.not.equal(ethers.constants.AddressZero);
      expect(zcTokenInfo.ccy).to.equal(targetCurrency);
      expect(zcTokenInfo.maturity).to.equal(0);
      expect(await zcToken.name()).to.equal(tokenName);
      expect(await zcToken.symbol()).to.equal(tokenSymbol);
    });

    it('Create a new zc token with maturity', async () => {
      await initialize(targetCurrency);

      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const nextMaturity = getLastFriday(
        moment(maturities[maturities.length - 1] * 1000).add(3, 'M'),
      );
      const tokenName = `ZC ${targetCurrencyName} ${nextMaturity
        .format('MMMYYYY')
        .toUpperCase()}`;
      const tokenSymbol = `zc${targetCurrencySymbol}-${nextMaturity.format(
        'YYYY-MM',
      )}`;

      await expect(
        lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate,
        ),
      )
        .to.emit(lendingMarketOperationLogic, 'ZCTokenCreated')
        .withArgs(
          targetCurrency,
          nextMaturity.unix(),
          tokenName,
          tokenSymbol,
          24,
          () => true,
        );

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        nextMaturity.unix(),
      );
      const zcTokenInfo = await lendingMarketControllerProxy.getZCTokenInfo(
        zcTokenAddress,
      );

      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      expect(zcTokenAddress).to.not.equal(ethers.constants.AddressZero);
      expect(zcTokenInfo.ccy).to.equal(targetCurrency);
      expect(zcTokenInfo.maturity).to.equal(nextMaturity.unix());
      expect(await zcToken.name()).to.equal(tokenName);
      expect(await zcToken.symbol()).to.equal(tokenSymbol);
    });

    it('Create a new zc token with maturity(+ 9 month)', async () => {
      await initialize(targetCurrency, 7);

      const maturities = await lendingMarketControllerProxy.getMaturities(
        targetCurrency,
      );

      const nextMaturity = getLastFriday(
        moment(maturities[maturities.length - 1] * 1000).add(3, 'M'),
      );
      const tokenName = `ZC ${targetCurrencyName} ${nextMaturity
        .format('MMMYYYY')
        .toUpperCase()}`;
      const tokenSymbol = `zc${targetCurrencySymbol}-${nextMaturity.format(
        'YYYY-MM',
      )}`;

      await expect(
        lendingMarketControllerProxy.createOrderBook(
          targetCurrency,
          genesisDate,
          genesisDate,
        ),
      )
        .to.emit(lendingMarketOperationLogic, 'ZCTokenCreated')
        .withArgs(
          targetCurrency,
          nextMaturity.unix(),
          tokenName,
          tokenSymbol,
          24,
          () => true,
        );

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        nextMaturity.unix(),
      );
      const zcTokenInfo = await lendingMarketControllerProxy.getZCTokenInfo(
        zcTokenAddress,
      );

      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      expect(zcTokenAddress).to.not.equal(ethers.constants.AddressZero);
      expect(zcTokenInfo.ccy).to.equal(targetCurrency);
      expect(zcTokenInfo.maturity).to.equal(nextMaturity.unix());
      expect(await zcToken.name()).to.equal(tokenName);
      expect(await zcToken.symbol()).to.equal(tokenSymbol);
    });

    it('Create a new zc token manually', async () => {
      await expect(
        lendingMarketControllerProxy.createZCToken(targetCurrency, 0),
      )
        .to.emit(lendingMarketOperationLogic, 'ZCTokenCreated')
        .withArgs(
          targetCurrency,
          0,
          `ZC ${targetCurrencyName}`,
          `zc${targetCurrencySymbol}`,
          24,
          () => true,
        );
    });

    it('Fail to create a new zc token manually if it already exists', async () => {
      await lendingMarketControllerProxy.createZCToken(targetCurrency, 0);

      await expect(
        lendingMarketControllerProxy.createZCToken(targetCurrency, 0),
      ).to.be.revertedWith('AlreadyZCTokenExists');
    });

    it('Fail to create a new zc token manually if the maturity is invalid', async () => {
      await expect(
        lendingMarketControllerProxy.createZCToken(targetCurrency, 1),
      ).to.be.revertedWith('InvalidMaturity');
    });

    it('Fail to create a new zc token manually if the caller is not owner', async () => {
      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .createZCToken(targetCurrency, 0),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Withdraw and Deposit', async () => {
    const value = BigNumber.from('100000000000000000');

    beforeEach(async () => {
      await initialize(targetCurrency);
    });

    it('Withdraw zc tokens without used collaterals ', async () => {
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([0, 0]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      const estimatedAmount = calculateFutureValue(value, 8000);
      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      expect(withdrawableAmount).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, maturities[0], estimatedAmount),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, estimatedAmount);

      expect(await zcToken.balanceOf(alice.address)).to.equal(estimatedAmount);
    });

    it('Withdraw zc tokens used as discounted collateral', async () => {
      const totalCollateral = value;
      const totalUnusedCollateral = value.div(2);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([
        totalCollateral,
        totalCollateral
          .sub(totalUnusedCollateral)
          .mul(PCT_DIGIT)
          .div(LIQUIDATION_THRESHOLD_RATE),
      ]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          value.mul(2),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '0',
        );

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      const estimatedAmount = calculateFutureValue(
        totalUnusedCollateral.mul(PCT_DIGIT).div(HAIRCUT),
        8000,
      );

      expect(withdrawableAmount).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(
            targetCurrency,
            maturities[0],
            estimatedAmount.add(1),
          ),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, estimatedAmount);

      expect(await zcToken.balanceOf(alice.address)).to.equal(estimatedAmount);
    });

    it('Withdraw zc tokens used as discounted collateral and allocated collateral as is', async () => {
      const totalCollateral = value.mul(2);
      const totalUnusedCollateral = value;
      const totalUsedCollateral = totalCollateral
        .sub(totalUnusedCollateral)
        .mul(PCT_DIGIT)
        .div(LIQUIDATION_THRESHOLD_RATE);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([totalCollateral, totalUsedCollateral]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          value.mul(2),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '0',
        );

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      const { presentValue: aliceLendPV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      const { presentValue: aliceBorrowPV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[1],
          alice.address,
        );

      const availableAmount = totalCollateral
        .mul(PCT_DIGIT)
        .sub(totalUsedCollateral.mul(LIQUIDATION_THRESHOLD_RATE))
        .div(PCT_DIGIT);
      const allocatedCollateralAmount = aliceBorrowPV
        .mul(LIQUIDATION_THRESHOLD_RATE)
        .div(PCT_DIGIT)
        .abs();
      const unallocatedCollateralAmount = aliceLendPV.sub(
        allocatedCollateralAmount,
      );

      const estimatedAmount = calculateFutureValue(
        unallocatedCollateralAmount
          .add(availableAmount)
          .sub(unallocatedCollateralAmount.mul(HAIRCUT).div(PCT_DIGIT)),
        8000,
      );

      expect(withdrawableAmount).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, maturities[0], withdrawableAmount),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, estimatedAmount);

      expect(await zcToken.balanceOf(alice.address)).to.equal(estimatedAmount);
    });

    it('Withdraw all zc tokens used as discounted collateral and allocated collateral as is', async () => {
      const totalCollateral = value.mul(3);
      const totalUnusedCollateral = value.mul(2);
      const totalUsedCollateral = totalCollateral
        .sub(totalUnusedCollateral)
        .mul(PCT_DIGIT)
        .div(LIQUIDATION_THRESHOLD_RATE);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([totalCollateral, totalUsedCollateral]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          value.mul(2),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '0',
        );

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      const { futureValue: aliceLendFV } =
        await lendingMarketControllerProxy.getPosition(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      const estimatedAmount = aliceLendFV;

      expect(withdrawableAmount).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, maturities[0], withdrawableAmount),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, estimatedAmount);

      expect(await zcToken.balanceOf(alice.address)).to.equal(estimatedAmount);
    });

    it('Withdraw zc perpetual tokens without allocated collaterals', async () => {
      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([0, 0]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      const withdrawableAmountBefore =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      expect(withdrawableAmountBefore).to.equal(0);

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[0],
      );

      const estimatedAmount = calculateFutureValue(value, 8000)
        .mul(BigNumber.from(10).pow(36))
        .div(autoRollLog.lendingCompoundFactor);

      const withdrawableAmountAfter =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      expect(withdrawableAmountAfter).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, 0, estimatedAmount),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, estimatedAmount);

      expect(await zcToken.balanceOf(alice.address)).to.equal(estimatedAmount);
    });

    it('Withdraw zc perpetual tokens used as discounted collateral', async () => {
      const totalCollateral = value;
      const totalUnusedCollateral = value.div(2);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([
        totalCollateral,
        totalCollateral
          .sub(totalUnusedCollateral)
          .mul(PCT_DIGIT)
          .div(LIQUIDATION_THRESHOLD_RATE),
      ]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          value.mul(2),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '0',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const compoundFactor =
        await genesisValueVaultProxy.getLendingCompoundFactor(targetCurrency);

      const estimatedAmount = calculateFutureValue(
        totalUnusedCollateral.mul(PCT_DIGIT).div(HAIRCUT),
        8000,
      )
        .mul(BigNumber.from(10).pow(36))
        .div(compoundFactor);
      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      expect(withdrawableAmount.sub(estimatedAmount).abs()).to.lte(1);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, 0, withdrawableAmount.add(1)),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          withdrawableAmount,
        );

      expect(await zcToken.balanceOf(alice.address)).to.equal(
        withdrawableAmount,
      );
    });

    it('Withdraw zc perpetual tokens used as discounted collateral and allocated collateral as is', async () => {
      const totalCollateral = value.mul(2);
      const totalUnusedCollateral = value.mul(3).div(2);
      const totalUsedCollateral = totalCollateral
        .sub(totalUnusedCollateral)
        .mul(PCT_DIGIT)
        .div(LIQUIDATION_THRESHOLD_RATE);

      await mockCurrencyController.mock[
        'convertFromBaseCurrency(bytes32,uint256[])'
      ].returns([totalCollateral, totalUsedCollateral]);

      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          value.mul(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          value.mul(2),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          value.mul(1),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          value.mul(1),
          '0',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          value.mul(PCT_DIGIT).div(HAIRCUT).div(2),
          '0',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .withdrawZCToken(targetCurrency, 0, withdrawableAmount),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          withdrawableAmount,
        );

      expect(await zcToken.balanceOf(alice.address)).to.equal(
        withdrawableAmount,
      );
    });

    it('Deposit zc tokens', async () => {
      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .withdrawZCToken(targetCurrency, maturities[0], withdrawableAmount);

      const currentBalance = await zcToken.balanceOf(alice.address);
      expect(currentBalance).to.equal(calculateFutureValue(value, 8000));

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .depositZCToken(targetCurrency, maturities[0], currentBalance),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(alice.address, ethers.constants.AddressZero, currentBalance);
    });

    it('Deposit zc tokens with exceeded amount', async () => {
      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        maturities[0],
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          maturities[0],
          alice.address,
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .withdrawZCToken(targetCurrency, maturities[0], withdrawableAmount);

      const currentBalance = await zcToken.balanceOf(alice.address);
      expect(currentBalance).to.equal(calculateFutureValue(value, 8000));

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .depositZCToken(targetCurrency, maturities[0], currentBalance.add(1)),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(alice.address, ethers.constants.AddressZero, currentBalance);

      expect(await zcToken.balanceOf(alice.address)).to.equal(0);
    });

    it('Deposit zc perpetual tokens', async () => {
      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .withdrawZCToken(targetCurrency, 0, withdrawableAmount);

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[0],
      );
      const estimatedAmount = calculateFutureValue(value, 8000)
        .mul(BigNumber.from(10).pow(36))
        .div(autoRollLog.lendingCompoundFactor);
      const currentBalance = await zcToken.balanceOf(alice.address);

      expect(currentBalance).to.equal(estimatedAmount);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .depositZCToken(targetCurrency, 0, currentBalance),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(alice.address, ethers.constants.AddressZero, currentBalance);

      expect(await zcToken.balanceOf(alice.address)).to.equal(0);
    });

    it('Deposit zc perpetual tokens with exceeded amount', async () => {
      const zcTokenAddress = await lendingMarketControllerProxy.getZCToken(
        targetCurrency,
        0,
      );
      const zcToken = await ethers.getContractAt('ZCToken', zcTokenAddress);

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(targetCurrency, maturities[0], Side.LEND, value, '8000');

      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(targetCurrency, maturities[0], Side.BORROW, value, '0');

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const withdrawableAmount =
        await lendingMarketControllerProxy.getWithdrawableZCTokenAmount(
          targetCurrency,
          0,
          alice.address,
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .withdrawZCToken(targetCurrency, 0, withdrawableAmount);

      const currentBalance = await zcToken.balanceOf(alice.address);

      await expect(
        lendingMarketControllerProxy
          .connect(alice)
          .depositZCToken(targetCurrency, 0, currentBalance.add(1)),
      )
        .to.emit(zcToken, 'Transfer')
        .withArgs(alice.address, ethers.constants.AddressZero, currentBalance);

      expect(await zcToken.balanceOf(alice.address)).to.equal(0);
    });

    it('Fail to withdraw zc tokens if the maturity is invalid', async () => {
      await expect(
        lendingMarketControllerProxy.withdrawZCToken(targetCurrency, 1, value),
      ).to.be.revertedWith('InvalidMaturity');
    });

    it('Fail to deposit zc tokens if the maturity is invalid', async () => {
      await expect(
        lendingMarketControllerProxy.depositZCToken(targetCurrency, 1, value),
      ).to.be.revertedWith('InvalidMaturity');
    });

    it('Fail to withdraw zc tokens if the caller has no balance of zc tokens', async () => {
      await expect(
        lendingMarketControllerProxy.withdrawZCToken(
          targetCurrency,
          maturities[0],
          value,
        ),
      ).to.be.revertedWith('AmountIsZero');
    });

    it('Fail to deposit zc tokens if the caller has no balance of zc tokens', async () => {
      await expect(
        lendingMarketControllerProxy.depositZCToken(
          targetCurrency,
          maturities[0],
          value,
        ),
      ).to.be.revertedWith('AmountIsZero');
    });

    it('Fail to withdraw zc tokens if the caller has no balance of zc perpetual tokens', async () => {
      await expect(
        lendingMarketControllerProxy.withdrawZCToken(targetCurrency, 0, value),
      ).to.be.revertedWith('AmountIsZero');
    });

    it('Fail to deposit zc tokens if the caller has no balance of zc perpetual tokens', async () => {
      await expect(
        lendingMarketControllerProxy.depositZCToken(targetCurrency, 0, value),
      ).to.be.revertedWith('AmountIsZero');
    });
  });
});
