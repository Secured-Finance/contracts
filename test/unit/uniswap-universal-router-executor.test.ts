import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

const RATE_PRECISION = ethers.constants.WeiPerEther;

describe('UniswapUniversalRouterExecutor', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let tokenA: Contract;
  let tokenB: Contract;
  let tokenC: Contract;
  let wrappedNativeToken: Contract;
  let permit2: Contract;
  let universalRouter: Contract;
  let executor: Contract;

  const amountIn = ethers.utils.parseEther('10');

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('MockERC20');
    tokenA = await tokenFactory.deploy(
      'Token A',
      'TKA',
      ethers.utils.parseEther('1000'),
    );
    tokenB = await tokenFactory.deploy(
      'Token B',
      'TKB',
      ethers.utils.parseEther('1000'),
    );
    tokenC = await tokenFactory.deploy(
      'Token C',
      'TKC',
      ethers.utils.parseEther('1000'),
    );
    wrappedNativeToken = await ethers
      .getContractFactory('MockWETH9')
      .then((factory) => factory.deploy());
    permit2 = await ethers
      .getContractFactory('MockPermit2')
      .then((factory) => factory.deploy());
    universalRouter = await ethers
      .getContractFactory('MockUniversalRouter')
      .then((factory) => factory.deploy(permit2.address));
    executor = await ethers
      .getContractFactory('UniswapUniversalRouterExecutor')
      .then((factory) =>
        factory.deploy(
          universalRouter.address,
          permit2.address,
          wrappedNativeToken.address,
        ),
      );

    await tokenB.transfer(
      universalRouter.address,
      ethers.utils.parseEther('500'),
    );
    await tokenC.transfer(
      universalRouter.address,
      ethers.utils.parseEther('500'),
    );
  });

  it('executes a V4 route and clears Permit2 allowances', async () => {
    const amountOut = amountIn.mul(2);
    await universalRouter.setExchangeRate(
      tokenA.address,
      tokenB.address,
      RATE_PRECISION.mul(2),
    );
    await executor.setRoute(tokenA.address, tokenB.address, [
      {
        protocol: 1,
        tokenOut: tokenB.address,
        fee: 3000,
        tickSpacing: 60,
        hooks: ethers.constants.AddressZero,
        hookData: '0x',
      },
    ]);
    await tokenA.approve(executor.address, amountIn);

    await expect(
      executor.swap(
        tokenA.address,
        tokenB.address,
        amountIn,
        amountOut,
        alice.address,
      ),
    )
      .to.emit(executor, 'SwapExecuted')
      .withArgs(
        owner.address,
        tokenA.address,
        tokenB.address,
        amountIn,
        amountOut,
        alice.address,
      );

    expect(await tokenB.balanceOf(alice.address)).to.equal(amountOut);
    expect(await tokenA.allowance(executor.address, permit2.address)).to.equal(
      0,
    );
    const permit2Allowance = await permit2.allowance(
      executor.address,
      tokenA.address,
      universalRouter.address,
    );
    expect(permit2Allowance.amount).to.equal(0);
  });

  it('executes a mixed V3 and V4 route', async () => {
    await universalRouter.setExchangeRate(
      tokenA.address,
      tokenB.address,
      RATE_PRECISION.mul(2),
    );
    await universalRouter.setExchangeRate(
      tokenB.address,
      tokenC.address,
      RATE_PRECISION.mul(3),
    );
    await executor.setRoute(tokenA.address, tokenC.address, [
      {
        protocol: 0,
        tokenOut: tokenB.address,
        fee: 500,
        tickSpacing: 0,
        hooks: ethers.constants.AddressZero,
        hookData: '0x',
      },
      {
        protocol: 1,
        tokenOut: tokenC.address,
        fee: 3000,
        tickSpacing: 60,
        hooks: ethers.constants.AddressZero,
        hookData: '0x',
      },
    ]);
    await tokenA.approve(executor.address, amountIn);

    await executor.swap(
      tokenA.address,
      tokenC.address,
      amountIn,
      amountIn.mul(6),
      alice.address,
    );

    expect(await tokenC.balanceOf(alice.address)).to.equal(amountIn.mul(6));
  });

  it('wraps native input before executing a route', async () => {
    await tokenA.transfer(
      universalRouter.address,
      ethers.utils.parseEther('100'),
    );
    await universalRouter.setExchangeRate(
      wrappedNativeToken.address,
      tokenA.address,
      RATE_PRECISION.mul(2),
    );
    await executor.setRoute(wrappedNativeToken.address, tokenA.address, [
      {
        protocol: 1,
        tokenOut: tokenA.address,
        fee: 3000,
        tickSpacing: 60,
        hooks: ethers.constants.AddressZero,
        hookData: '0x',
      },
    ]);

    await executor.swap(
      wrappedNativeToken.address,
      tokenA.address,
      amountIn,
      amountIn.mul(2),
      alice.address,
      { value: amountIn },
    );

    expect(await tokenA.balanceOf(alice.address)).to.equal(amountIn.mul(2));
  });

  it('unwraps wrapped-native output after executing a route', async () => {
    await wrappedNativeToken.deposit({ value: ethers.utils.parseEther('100') });
    await wrappedNativeToken.transfer(
      universalRouter.address,
      ethers.utils.parseEther('100'),
    );
    await universalRouter.setExchangeRate(
      tokenA.address,
      wrappedNativeToken.address,
      RATE_PRECISION,
    );
    await executor.setRoute(tokenA.address, wrappedNativeToken.address, [
      {
        protocol: 1,
        tokenOut: wrappedNativeToken.address,
        fee: 3000,
        tickSpacing: 60,
        hooks: ethers.constants.AddressZero,
        hookData: '0x',
      },
    ]);
    await tokenA.approve(executor.address, amountIn);

    const balanceBefore = await ethers.provider.getBalance(alice.address);
    await executor.swap(
      tokenA.address,
      wrappedNativeToken.address,
      amountIn,
      amountIn,
      alice.address,
    );
    const balanceAfter = await ethers.provider.getBalance(alice.address);

    expect(balanceAfter.sub(balanceBefore)).to.equal(amountIn);
  });

  it('rejects route updates from non-owners', async () => {
    await expect(
      executor.connect(alice).setRoute(tokenA.address, tokenB.address, []),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
