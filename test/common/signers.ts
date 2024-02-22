import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract, utils } from 'ethers';

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

const getPermitSignature = async (
  chainId: number,
  token: Contract,
  owner: SignerWithAddress,
  spender: SignerWithAddress | Contract,
  value: BigNumber,
  deadline: number,
) => {
  const nonce = await token.nonces(owner.address);

  const domain = {
    name: await token.name(),
    version: '1',
    chainId,
    verifyingContract: token.address,
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    owner: owner.address,
    spender: spender.address,
    value: value.toString(),
    nonce: nonce.toString(),
    deadline: deadline,
  };

  const signature = await owner._signTypedData(domain, types, message);
  return utils.splitSignature(signature);
};

export { Signers, getPermitSignature };
