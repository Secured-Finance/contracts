import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

const RATE_PRECISION = ethers.constants.WeiPerEther;

describe('ParasailWPFILAdapter', () => {
  let owner: SignerWithAddress;
  let pFIL: Contract;
  let wpFIL: Contract;
  let wFIL: Contract;
  let pool: Contract;
  let adapter: Contract;

  const inputAmount = ethers.utils.parseEther('10');
  const outputAmount = ethers.utils.parseEther('11');

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    pFIL = await ethers
      .getContractFactory('MockERC20')
      .then((factory) => factory.deploy('Parasail FIL', 'pFIL', 0));
    wpFIL = await ethers
      .getContractFactory('MockWPFIL')
      .then((factory) =>
        factory.deploy(
          pFIL.address,
          RATE_PRECISION.mul(11).div(10),
          ethers.utils.parseEther('1000'),
        ),
      );
    wFIL = await ethers
      .getContractFactory('MockWETH9')
      .then((factory) => factory.deploy());
    pool = await ethers
      .getContractFactory('MockParasailPool')
      .then((factory) => factory.deploy(pFIL.address));
    adapter = await ethers
      .getContractFactory('ParasailWPFILAdapter')
      .then((factory) =>
        factory.deploy(pool.address, wpFIL.address, pFIL.address, wFIL.address),
      );

    await pFIL.setMinterRole(wpFIL.address);
    await pFIL.setMinterRole(pool.address);
    await owner.sendTransaction({
      to: pool.address,
      value: ethers.utils.parseEther('100'),
    });
  });

  it('previews and converts wpFIL into wrapped FIL', async () => {
    expect(await adapter.previewConvert(inputAmount)).to.equal(outputAmount);

    await wpFIL.approve(adapter.address, inputAmount);
    await adapter.convert(inputAmount);

    expect(await wFIL.balanceOf(owner.address)).to.equal(outputAmount);
    expect(await wpFIL.balanceOf(adapter.address)).to.equal(0);
    expect(await pFIL.balanceOf(adapter.address)).to.equal(0);
  });
});
