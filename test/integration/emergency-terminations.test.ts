import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import { usdcToETHRate, wFilToETHRate } from '../common/constants';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Emergency terminations', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  let futureValueVaults: Contract[];
  let reserveFund: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;

  let lendingMarketOperationLogic: Contract;
  let fundManagementLogic: Contract;

  let ethLendingMarkets: Contract[] = [];
  let filLendingMarkets: Contract[] = [];
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wFILToken: Contract;
  let wFilToETHPriceFeed: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  let signers: Signers;

  const initialUSDCBalance = BigNumber.from('10000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');
  const orderAmountInETH = BigNumber.from('100000000000000000');
  const orderAmountInUSDC = orderAmountInETH
    .mul(BigNumber.from(10).pow(6))
    .div(usdcToETHRate);
  const orderAmountInFIL = orderAmountInETH
    .mul(BigNumber.from(10).pow(18))
    .div(wFilToETHRate);

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
      await usdcToken
        .connect(owner)
        .transfer(signer.address, initialUSDCBalance);
    });

  const createSampleETHOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
    diffAmount = '1000',
  ) => {
    await tokenVault.connect(user).deposit(hexETH, orderAmountInETH, {
      value: orderAmountInETH,
    });

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexETH,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add(diffAmount),
      );

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexETH,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).sub(diffAmount),
      );
  };

  const createSampleFILOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
    diffAmount = '1000',
  ) => {
    await wFILToken.connect(user).approve(tokenVault.address, orderAmountInETH);
    await tokenVault.connect(user).deposit(hexWFIL, orderAmountInETH);

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexWFIL,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add(diffAmount),
      );

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexWFIL,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).sub(diffAmount),
      );
  };

  const resetContractInstances = async () => {
    maturities = await lendingMarketController.getMaturities(hexETH);
    [ethLendingMarkets, filLendingMarkets, futureValueVaults] =
      await Promise.all([
        lendingMarketController
          .getLendingMarkets(hexETH)
          .then((addresses) =>
            Promise.all(
              addresses.map((address) =>
                ethers.getContractAt('LendingMarket', address),
              ),
            ),
          ),
        lendingMarketController
          .getLendingMarkets(hexWFIL)
          .then((addresses) =>
            Promise.all(
              addresses.map((address) =>
                ethers.getContractAt('LendingMarket', address),
              ),
            ),
          ),
        Promise.all(
          maturities.map((maturity) =>
            lendingMarketController
              .getFutureValueVault(hexETH, maturity)
              .then((address) =>
                ethers.getContractAt('FutureValueVault', address),
              ),
          ),
        ),
      ]);
  };

  const initializeContracts = async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      reserveFund,
      wETHToken,
      wFILToken,
      usdcToken,
      wFilToETHPriceFeed,
      lendingMarketOperationLogic,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, true);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, true);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexETH, genesisDate);
      await lendingMarketController.createLendingMarket(hexWFIL, genesisDate);
    }

    maturities = await lendingMarketController.getMaturities(hexETH);
  };

  describe('Execute emergency termination & redemption', async () => {
    describe('Including only healthy users', async () => {
      before(async () => {
        await initializeContracts();
        await resetContractInstances();
        [alice, bob, carol] = await getUsers(3);
      });

      it('Fill an order on the ETH market with depositing ETH', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexETH,
              maturities[0],
              Side.BORROW,
              orderAmountInETH,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmountInETH,
              0,
              { value: orderAmountInETH },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { futureValue: aliceFV } =
          await futureValueVaults[0].getFutureValue(alice.address);
        const { futureValue: bobFV } =
          await futureValueVaults[0].getFutureValue(bob.address);

        expect(aliceFV).not.to.equal('0');
        expect(bobFV).to.equal('0');
      });

      it('Fill an order on the FIL market with depositing USDC', async () => {
        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmountInFIL);

        await usdcToken
          .connect(bob)
          .approve(tokenVault.address, orderAmountInUSDC.mul(2));
        await tokenVault
          .connect(bob)
          .deposit(hexUSDC, orderAmountInUSDC.mul(2));

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexWFIL,
              maturities[0],
              Side.BORROW,
              orderAmountInFIL,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              maturities[0],
              Side.LEND,
              orderAmountInFIL,
              0,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { futureValue: aliceFV } =
          await futureValueVaults[0].getFutureValue(alice.address);
        const { futureValue: bobFV } =
          await futureValueVaults[0].getFutureValue(bob.address);

        expect(aliceFV).not.to.equal('0');
        expect(bobFV).to.equal('0');
      });

      it('Execute emergency termination', async () => {
        await createSampleETHOrders(carol, maturities[0], '8000');
        await createSampleFILOrders(carol, maturities[0], '8000');

        await expect(
          lendingMarketController.executeEmergencyTermination(),
        ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
      });

      it('Execute forced redemption', async () => {
        const aliceTotalPVBefore =
          await lendingMarketController.getTotalPresentValueInBaseCurrency(
            alice.address,
          );
        const bobTotalPVBefore =
          await lendingMarketController.getTotalPresentValueInBaseCurrency(
            bob.address,
          );
        const bobTotalCollateralBefore =
          await tokenVault.getTotalCollateralAmount(bob.address);

        // Execute forced redemption for alice
        const alicePV =
          await lendingMarketController.getTotalPresentValueInBaseCurrency(
            alice.address,
          );

        await expect(
          lendingMarketController.connect(alice).executeEmergencySettlement(),
        )
          .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
          .withArgs(alice.address, alicePV);

        // Execute forced redemption for bob
        const [bobCollateral, bobPV] = await Promise.all([
          tokenVault.getTotalCollateralAmount(bob.address),
          lendingMarketController.getTotalPresentValueInBaseCurrency(
            bob.address,
          ),
        ]);

        await expect(
          lendingMarketController.connect(bob).executeEmergencySettlement(),
        )
          .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
          .withArgs(bob.address, bobCollateral.add(bobPV));

        // Execute forced redemption for others
        await expect(
          lendingMarketController.connect(carol).executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        // Execute forced redemption for reserve fund
        const reserveFundPV =
          await lendingMarketController.getTotalPresentValueInBaseCurrency(
            reserveFund.address,
          );
        const data = lendingMarketController.interface.encodeFunctionData(
          'executeEmergencySettlement',
        );
        await expect(
          reserveFund.executeTransaction(lendingMarketController.address, data),
        )
          .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
          .withArgs(reserveFund.address, reserveFundPV);

        // Check future value
        for (const { address } of [alice, bob, carol, reserveFund]) {
          const fv =
            await lendingMarketController.getTotalPresentValueInBaseCurrency(
              address,
            );
          expect(fv).equal(0);
        }

        // Check collateral
        const aliceTotalCollateralAfter =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const bobTotalCollateralAfter =
          await tokenVault.getTotalCollateralAmount(bob.address);

        const roundedDecimals =
          orderAmountInETH.toString().length -
          orderAmountInUSDC.toString().length;

        expect(aliceTotalPVBefore.sub(aliceTotalCollateralAfter).abs()).to.lt(
          BigNumber.from(10).pow(roundedDecimals),
        );
        expect(
          bobTotalCollateralBefore
            .add(bobTotalPVBefore)
            .sub(bobTotalCollateralAfter),
        ).to.lt(BigNumber.from(10).pow(roundedDecimals));
      });

      it('Withdraw all collateral', async () => {
        const rfETHDepositAmount = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );
        const rfUSDCDepositAmount = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexUSDC,
        );

        await reserveFund.withdraw(hexETH, rfETHDepositAmount);
        await reserveFund.withdraw(hexUSDC, rfUSDCDepositAmount);

        for (const user of [alice, bob, carol]) {
          const currencies = [hexETH, hexUSDC];

          const deposits = await Promise.all(
            currencies.map((ccy) =>
              tokenVault.getDepositAmount(user.address, ccy),
            ),
          );

          await tokenVault.connect(user).withdraw(hexETH, deposits[0]);
          await tokenVault.connect(user).withdraw(hexUSDC, deposits[1]);

          await Promise.all(
            currencies.map((ccy) =>
              tokenVault
                .getDepositAmount(user.address, ccy)
                .then((deposit) => expect(deposit).equal(0)),
            ),
          );
        }

        expect(await tokenVault.getTotalDepositAmount(hexETH)).lte(1);
        expect(await tokenVault.getTotalDepositAmount(hexUSDC)).lte(1);
      });
    });

    describe('Including an auto-rolled position', async () => {
      before(async () => {
        await initializeContracts();
        await resetContractInstances();
        [alice, bob, carol] = await getUsers(3);
      });

      it('Fill an order on the ETH market with depositing ETH', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexETH,
              maturities[0],
              Side.BORROW,
              orderAmountInETH,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmountInETH,
              0,
              { value: orderAmountInETH },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Execute auto-roll', async () => {
        // Move to 6 hours (21600 sec) before maturity.
        await time.increaseTo(maturities[0].sub('21600').toString());
        await createSampleETHOrders(carol, maturities[0], '8000', '0');
        await createSampleETHOrders(carol, maturities[1], '8000', '0');

        await time.increaseTo(maturities[0].toString());
        await lendingMarketController
          .connect(owner)
          .rotateLendingMarkets(hexETH);

        await lendingMarketController.cleanUpAllFunds(alice.address);
        await lendingMarketController.cleanUpAllFunds(bob.address);
      });

      it('Execute emergency termination', async () => {
        await expect(
          lendingMarketController.executeEmergencyTermination(),
        ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
      });

      it('Execute forced redemption', async () => {
        const { presentValue: bobPV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            bob.address,
          );

        const bobDeposit = await tokenVault.getDepositAmount(
          bob.address,
          hexETH,
        );

        await expect(
          lendingMarketController.connect(alice).executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        await expect(
          lendingMarketController.connect(bob).executeEmergencySettlement(),
        )
          .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
          .withArgs(bob.address, bobDeposit.add(bobPV));

        for (const user of [alice, bob]) {
          const fv =
            await lendingMarketController.getTotalPresentValueInBaseCurrency(
              user.address,
            );
          expect(fv).equal(0);
        }
      });
    });

    describe('Including a liquidation user', async () => {
      before(async () => {
        await initializeContracts();
        await resetContractInstances();
        [alice, bob, carol] = await getUsers(3);
      });

      it('Fill an order on the ETH market with depositing ETH', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexETH,
              maturities[0],
              Side.BORROW,
              orderAmountInETH,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmountInETH,
              0,
              { value: orderAmountInETH },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill an order on the FIL market with depositing USDC', async () => {
        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmountInFIL);

        await usdcToken
          .connect(bob)
          .approve(tokenVault.address, orderAmountInUSDC.div(5));
        await tokenVault
          .connect(bob)
          .deposit(hexUSDC, orderAmountInUSDC.div(5));

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexWFIL,
              maturities[0],
              Side.BORROW,
              orderAmountInFIL.div(10),
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              maturities[0],
              Side.LEND,
              orderAmountInFIL.div(10),
              0,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Update a price feed to change the wFIL price', async () => {
        await createSampleETHOrders(carol, maturities[0], '8000');
        await createSampleFILOrders(carol, maturities[0], '8000');

        const coverageBefore = await tokenVault.getCoverage(bob.address);
        expect(coverageBefore).lt('8000');

        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul(20));

        const coverageAfter = await tokenVault.getCoverage(bob.address);
        expect(coverageAfter).gte('8000');
      });

      it('Execute emergency termination', async () => {
        await expect(
          lendingMarketController.executeEmergencyTermination(),
        ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
      });

      it('Execute forced redemption', async () => {
        await expect(
          lendingMarketController.connect(alice).executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        await expect(
          lendingMarketController.connect(bob).executeEmergencySettlement(),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');

        for (const user of [alice, bob]) {
          const fv =
            await lendingMarketController.getTotalPresentValueInBaseCurrency(
              user.address,
            );
          expect(fv).equal(0);
        }
      });
    });

    describe('Including an insolvent user', async () => {
      before(async () => {
        await initializeContracts();
        await resetContractInstances();
        [alice, bob, carol, dave] = await getUsers(4);
      });

      it('Fill an order on the ETH market with depositing ETH', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexETH,
              maturities[0],
              Side.BORROW,
              orderAmountInETH,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmountInETH,
              0,
              { value: orderAmountInETH },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill an order on the FIL market with depositing USDC', async () => {
        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmountInFIL);

        await usdcToken
          .connect(bob)
          .approve(tokenVault.address, orderAmountInUSDC.mul(2));
        await tokenVault
          .connect(bob)
          .deposit(hexUSDC, orderAmountInUSDC.mul(2));

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexWFIL,
              maturities[0],
              Side.BORROW,
              orderAmountInFIL,
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              maturities[0],
              Side.LEND,
              orderAmountInFIL,
              0,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Fill an order for a huge amount to store fees in the reserve funds', async () => {
        await tokenVault
          .connect(carol)
          .deposit(hexETH, orderAmountInETH.mul(2000), {
            value: orderAmountInETH.mul(2000),
          });

        await expect(
          lendingMarketController
            .connect(carol)
            .executeOrder(
              hexETH,
              maturities[0],
              Side.BORROW,
              orderAmountInETH.mul(1000),
              8000,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(dave)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmountInETH.mul(1000),
              0,
              { value: orderAmountInETH.mul(1000) },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });

      it('Update a price feed to change the wFIL price', async () => {
        await createSampleETHOrders(carol, maturities[0], '8000');
        await createSampleFILOrders(carol, maturities[0], '8000');

        const coverageBefore = await tokenVault.getCoverage(bob.address);
        expect(coverageBefore).lt('8000');

        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul(5));

        const coverageAfter = await tokenVault.getCoverage(bob.address);
        expect(coverageAfter).gte('8000');
      });

      it('Execute emergency termination', async () => {
        await expect(
          lendingMarketController.executeEmergencyTermination(),
        ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
      });

      it('Execute forced redemption', async () => {
        for (const user of [alice, carol, dave]) {
          await expect(
            lendingMarketController.connect(user).executeEmergencySettlement(),
          ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');
        }

        await expect(
          lendingMarketController.connect(bob).executeEmergencySettlement(),
        ).to.revertedWith('Insufficient collateral');

        const data = lendingMarketController.interface.encodeFunctionData(
          'executeEmergencySettlement',
        );
        await expect(
          reserveFund.executeTransaction(lendingMarketController.address, data),
        ).to.emit(fundManagementLogic, 'EmergencySettlementExecuted');
      });

      it('Withdraw all collateral', async () => {
        for (const user of [alice, carol, dave]) {
          const currencies = [hexETH, hexUSDC];

          const deposits = await Promise.all(
            currencies.map((ccy) =>
              tokenVault.getDepositAmount(user.address, ccy),
            ),
          );

          await tokenVault.connect(user).withdraw(hexETH, deposits[0]);
          await tokenVault.connect(user).withdraw(hexUSDC, deposits[1]);

          await Promise.all(
            currencies.map((ccy) =>
              tokenVault
                .getDepositAmount(user.address, ccy)
                .then((deposit) => expect(deposit).equal(0)),
            ),
          );
        }

        const rfETHDepositAmount = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );
        const rfUSDCDepositAmount = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexUSDC,
        );

        await expect(
          reserveFund.withdraw(hexETH, rfETHDepositAmount),
        ).to.revertedWith('Protocol is insolvent');
        await expect(
          reserveFund.withdraw(hexUSDC, rfUSDCDepositAmount),
        ).to.revertedWith('Protocol is insolvent');
      });
    });
  });
});
