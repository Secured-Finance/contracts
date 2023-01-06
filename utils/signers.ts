import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

class Signers {
  signerIdx: number;
  signers: SignerWithAddress[];

  constructor(signers: SignerWithAddress[], signerIdx = 0) {
    this.signers = signers;
    this.signerIdx = signerIdx;
  }

  async get(
    count: number,
    callback?: (user: SignerWithAddress) => Promise<void>,
  ) {
    const users: SignerWithAddress[] = [];

    for (let i = 0; i < count; i++) {
      const user = this.signers[this.signerIdx];
      this.signerIdx++;

      users.push(user);
      await callback?.(user);
    }

    return users;
  }
}

export { Signers };
