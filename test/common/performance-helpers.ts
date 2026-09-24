import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';

/**
 * Helper to send ETH to a user for gas fees
 */
export const sendETH = async (
  signers: SignerWithAddress[],
  signerIdx: { current: number },
  currencyKey: string,
  to: string,
  amount: BigNumber,
) => {
  const balance = await signers[signerIdx.current].getBalance();
  const gasBuffer = ethers.utils.parseEther('0.2');
  const sendAmount = currencyKey === hexETH ? amount.add(gasBuffer) : gasBuffer;

  if (balance.lt(sendAmount)) {
    signerIdx.current++;
  }

  await signers[signerIdx.current]
    .sendTransaction({
      to: to,
      value: sendAmount,
    })
    .then((tx) => tx.wait());
};

/**
 * Helper to deposit tokens for a user
 */
export const depositForUser = async (
  signers: SignerWithAddress[],
  signerIdx: { current: number },
  tokenVault: Contract,
  getTokenContract: (currencyKey: string) => Contract,
  user: Wallet | SignerWithAddress,
  currencyKey: string,
  amount: BigNumber,
) => {
  const contract = getTokenContract(currencyKey);

  await sendETH(signers, signerIdx, currencyKey, user.address, amount);

  if (currencyKey === hexETH) {
    await tokenVault
      .connect(user)
      .deposit(currencyKey, amount, {
        value: amount,
      })
      .then((tx) => tx.wait());
  } else {
    await contract
      .connect(signers[0])
      .transfer(user.address, amount)
      .then((tx) => tx.wait());

    await contract
      .connect(user)
      .approve(tokenVault.address, ethers.constants.MaxUint256)
      .then((tx) => tx.wait());

    await tokenVault
      .connect(user)
      .deposit(currencyKey, amount)
      .then((tx) => tx.wait());
  }
};

/**
 * Progress indicator for long-running operations
 */
export const progressIndicator = {
  start: (message: string) => {
    process.stdout.write(`        ${message}: 0`);
  },
  update: (message: string, current: number, total: number) => {
    process.stdout.write('\r\x1b[K');
    process.stdout.write(`        ${message}: ${current}/${total}`);
  },
  clear: () => {
    process.stdout.write('\r\x1b[K');
  },
};

export const getAllUnitPrices = async (
  lendingMarketController: Contract,
  lendingMarket: Contract,
  currencyKey: string,
  maturity: BigNumber,
  side: number,
): Promise<number[]> => {
  const orderBookId = await lendingMarketController.getOrderBookId(
    currencyKey,
    maturity,
  );

  let allUnitPrices: number[] = [];
  let start = 0;
  const limit = 1000; // Fetch 1000 at a time to avoid gas issues

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { unitPrices, next } = await lendingMarket[
      side === Side.BORROW ? 'getLendOrderBook' : 'getBorrowOrderBook'
    ](orderBookId, start, limit);

    allUnitPrices = allUnitPrices.concat(
      unitPrices
        .map((up: BigNumber) => up.toNumber())
        .filter((up: number) => up !== 0),
    );

    if (next.isZero()) {
      break;
    }
    start = next.toNumber();
  }

  return allUnitPrices;
};
