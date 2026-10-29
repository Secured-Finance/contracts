import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

const FIL = ethers.utils.formatBytes32String('FIL');
const IFIL = ethers.utils.formatBytes32String('iFIL');
const USDC = ethers.utils.formatBytes32String('USDC');
const RATE_PRECISION = ethers.constants.WeiPerEther;

describe('Liquidator', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let iFIL: Contract;
  let wFIL: Contract;
  let usdc: Contract;
  let pool: Contract;
  let adapter: Contract;
  let tokenVault: Contract;
  let controller: Contract;
  let router: Contract;
  let liquidator: Contract;

  const collateralAmount = ethers.utils.parseEther('10');
  const convertedAmount = ethers.utils.parseEther('11');
  const swappedAmount = ethers.utils.parseEther('22');

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    iFIL = await ethers
      .getContractFactory('MockERC20')
      .then((factory) =>
        factory.deploy('InfiniFIL', 'iFIL', ethers.utils.parseEther('1000')),
      );
    wFIL = await ethers
      .getContractFactory('MockWETH9')
      .then((factory) => factory.deploy());
    usdc = await ethers
      .getContractFactory('MockERC20')
      .then((factory) =>
        factory.deploy('USD Coin', 'USDC', ethers.utils.parseEther('1000')),
      );
    pool = await ethers
      .getContractFactory('MockInfinityPool')
      .then((factory) =>
        factory.deploy(
          iFIL.address,
          wFIL.address,
          RATE_PRECISION.mul(11).div(10),
        ),
      );

    await iFIL.setMinterRole(pool.address);
    await owner.sendTransaction({
      to: pool.address,
      value: ethers.utils.parseEther('100'),
    });

    adapter = await ethers
      .getContractFactory('GlifIFILAdapter')
      .then((factory) =>
        factory.deploy(pool.address, iFIL.address, wFIL.address),
      );
    tokenVault = await ethers
      .getContractFactory('MockLiquidationTokenVault')
      .then((factory) => factory.deploy(wFIL.address));
    controller = await ethers
      .getContractFactory('MockLiquidationController')
      .then((factory) => factory.deploy());
    router = await ethers
      .getContractFactory('MockLiquidationV3Router')
      .then((factory) => factory.deploy(RATE_PRECISION.mul(2)));

    await tokenVault.setTokenAddress(FIL, wFIL.address);
    await tokenVault.setTokenAddress(IFIL, iFIL.address);
    await tokenVault.setTokenAddress(USDC, usdc.address);
    liquidator = await ethers
      .getContractFactory('Liquidator')
      .then((factory) =>
        factory.deploy(FIL, controller.address, tokenVault.address),
      );
    await controller.setReceivedAmounts(collateralAmount, collateralAmount);
    await iFIL.transfer(tokenVault.address, collateralAmount);
    await usdc.transfer(router.address, ethers.utils.parseEther('100'));
  });

  describe('GlifIFILAdapter', () => {
    it('previews and converts iFIL into wrapped FIL', async () => {
      expect(await adapter.previewConvert(collateralAmount)).to.equal(
        convertedAmount,
      );

      await iFIL.approve(adapter.address, collateralAmount);
      await adapter.convert(collateralAmount);

      expect(await wFIL.balanceOf(owner.address)).to.equal(convertedAmount);
      expect(await iFIL.balanceOf(adapter.address)).to.equal(0);
    });

    it('normalizes wrapped FIL returned by the pool', async () => {
      await pool.setReturnsWrappedToken(true);
      await iFIL.approve(adapter.address, collateralAmount);

      await adapter.convert(collateralAmount);

      expect(await wFIL.balanceOf(owner.address)).to.equal(convertedAmount);
    });
  });

  describe('conversion route', () => {
    beforeEach(async () => {
      await liquidator.setConversionAdapter(iFIL.address, adapter.address);
    });

    it('converts without a minimum and deposits directly when the output matches the debt token', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await expect(
        liquidator.executeLiquidationCall(
          IFIL,
          [],
          FIL,
          maturity,
          alice.address,
          ethers.constants.AddressZero,
          10,
          0,
        ),
      )
        .to.emit(liquidator, 'TokenConverted')
        .withArgs(
          adapter.address,
          iFIL.address,
          wFIL.address,
          collateralAmount,
          convertedAmount,
        );

      expect(await tokenVault.depositAmounts(liquidator.address, FIL)).to.equal(
        convertedAmount,
      );
      expect(await wFIL.balanceOf(liquidator.address)).to.equal(0);
      expect(
        await iFIL.allowance(liquidator.address, adapter.address),
      ).to.equal(0);
    });

    it('swaps the converted token when it differs from the debt token', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await liquidator.executeLiquidationCall(
        IFIL,
        [],
        USDC,
        maturity,
        alice.address,
        router.address,
        10,
        swappedAmount,
      );

      expect(
        await tokenVault.depositAmounts(liquidator.address, USDC),
      ).to.equal(swappedAmount);
    });

    it('skips conversion when the collateral already matches the debt token', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await liquidator.executeLiquidationCall(
        IFIL,
        [],
        IFIL,
        maturity,
        alice.address,
        ethers.constants.AddressZero,
        10,
        0,
      );

      expect(
        await tokenVault.depositAmounts(liquidator.address, IFIL),
      ).to.equal(collateralAmount);
      expect(await iFIL.balanceOf(pool.address)).to.equal(0);
    });

    it('reverts when the direct collateral output is below the minimum', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await expect(
        liquidator.executeLiquidationCall(
          IFIL,
          [],
          IFIL,
          maturity,
          alice.address,
          ethers.constants.AddressZero,
          10,
          collateralAmount.add(1),
        ),
      ).to.be.reverted;
    });

    it('reverts when the DEX output is below the minimum', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await expect(
        liquidator.executeLiquidationCall(
          IFIL,
          [],
          USDC,
          maturity,
          alice.address,
          router.address,
          10,
          swappedAmount.add(1),
        ),
      ).to.be.revertedWith('Too little received');
    });

    it('reverts when the conversion output is below the minimum', async () => {
      const maturity = BigNumber.from(
        (await ethers.provider.getBlock('latest')).timestamp + 3600,
      );

      await expect(
        liquidator.executeLiquidationCall(
          IFIL,
          [],
          FIL,
          maturity,
          alice.address,
          ethers.constants.AddressZero,
          10,
          convertedAmount.add(1),
        ),
      ).to.be.reverted;

      expect(await iFIL.balanceOf(tokenVault.address)).to.equal(
        collateralAmount,
      );
    });
  });

  describe('conversion adapter configuration', () => {
    it('only allows the owner to update an adapter', async () => {
      await expect(
        liquidator
          .connect(alice)
          .setConversionAdapter(iFIL.address, adapter.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('rejects an address that is not an adapter contract', async () => {
      await expect(liquidator.setConversionAdapter(iFIL.address, alice.address))
        .to.be.reverted;
    });

    it('rejects an adapter for the native token', async () => {
      const nativeTokenAdapter = await ethers
        .getContractFactory('GlifIFILAdapter')
        .then((factory) =>
          factory.deploy(pool.address, wFIL.address, usdc.address),
        );

      await expect(
        liquidator.setConversionAdapter(
          wFIL.address,
          nativeTokenAdapter.address,
        ),
      ).to.be.reverted;
    });

    it('registers and removes an adapter', async () => {
      await expect(
        liquidator.setConversionAdapter(iFIL.address, adapter.address),
      )
        .to.emit(liquidator, 'ConversionAdapterUpdated')
        .withArgs(iFIL.address, ethers.constants.AddressZero, adapter.address);
      expect(await liquidator.conversionAdapters(iFIL.address)).to.equal(
        adapter.address,
      );

      await expect(
        liquidator.setConversionAdapter(
          iFIL.address,
          ethers.constants.AddressZero,
        ),
      )
        .to.emit(liquidator, 'ConversionAdapterUpdated')
        .withArgs(iFIL.address, adapter.address, ethers.constants.AddressZero);
      expect(await liquidator.conversionAdapters(iFIL.address)).to.equal(
        ethers.constants.AddressZero,
      );
    });
  });
});
