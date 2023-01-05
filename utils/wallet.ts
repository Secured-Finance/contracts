import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { BigNumber, Wallet } from 'ethers';
import { waffle } from 'hardhat';

class TestWallet {
  signerIdx: number = 1;
  signers: SignerWithAddress[] | undefined;
  initialBalance: BigNumber;
  ethers: HardhatEthersHelpers;

  constructor(initialBalance: BigNumber, ethers: HardhatEthersHelpers) {
    this.initialBalance = initialBalance;
    this.ethers = ethers;
  }

  async create(count: number, callback: (user: Wallet) => Promise<void>) {
    if (!this.signers) {
      this.signers = await this.ethers.getSigners();
    }

    const users: Wallet[] = [];

    for (let i = 0; i < count; i++) {
      const user = waffle.provider.createEmptyWallet();

      const balance = await this.signers[this.signerIdx].getBalance();
      if (balance.lt(this.initialBalance)) {
        this.signerIdx++;
      }

      await this.signers[this.signerIdx].sendTransaction({
        to: user.address,
        value: this.initialBalance,
      });

      users.push(user);
      await callback(user);
    }

    return users;
  }
}

export { TestWallet };
