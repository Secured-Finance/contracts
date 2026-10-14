import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';

interface ResidualOrderInput {
  orderId: number;
  unitPrice: number;
  maker: string;
  amount: BigNumber;
}

interface RecoveryInput {
  maturity: number;
  side: number;
  expectedRoot: BigNumber;
  orders: ResidualOrderInput[];
}

describe('OrderBook incident residual recovery', () => {
  let recovery: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let maturity: number;

  const buildRecoveryInput = async (): Promise<RecoveryInput> => {
    const orderIds = [1, 2];
    const unitPrices = [9000, 3];
    const makers = [alice, bob];
    const orders: ResidualOrderInput[] = [];

    for (let i = 0; i < orderIds.length; ++i) {
      const treeOrder = await recovery.getTreeOrder(
        Side.LEND,
        unitPrices[i],
        orderIds[i],
      );
      orders.push({
        orderId: orderIds[i],
        unitPrice: unitPrices[i],
        maker: makers[i].address,
        amount: treeOrder.amount,
      });
    }

    return {
      maturity,
      side: Side.LEND,
      expectedRoot: await recovery.getRoot(Side.LEND),
      orders,
    };
  };

  const executeRecovery = (input: RecoveryInput) =>
    recovery.recoverIncidentResidualOrders(
      input.maturity,
      input.side,
      input.expectedRoot,
      input.orders,
    );

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const { timestamp } = await ethers.provider.getBlock('latest');
    maturity = timestamp + 90 * 24 * 60 * 60;

    recovery = await ethers
      .getContractFactory('OrderBookRecoveryContract')
      .then((factory) => factory.deploy());
    await recovery.initialize(maturity);
    await recovery.placeOrder(Side.LEND, alice.address, 100, 9000);
    await recovery.placeOrder(Side.LEND, bob.address, 200, 3);
  });

  it('removes the complete residual tree and resets the polluted sentinel', async () => {
    const pollutedEmptyNode = {
      parent: 9000,
      left: 3,
      right: 9000,
      red: true,
      head: 7,
      tail: 8,
      orderCounter: 9,
      orderTotalAmount: 10,
      firstChunkId: 11,
      lastChunkId: 12,
      lastAllocatedChunkId: 13,
      explicitMappingStartOrderId: 14,
      activeChunkCount: 15,
    };
    await recovery.setEmptyNode(Side.LEND, pollutedEmptyNode);
    await recovery.clearActiveOrderIds(Side.LEND, alice.address);
    await recovery.clearActiveOrderIds(Side.LEND, bob.address);

    const input = await buildRecoveryInput();
    await executeRecovery(input);

    expect(await recovery.getRoot(Side.LEND)).to.equal(0);
    for (const unitPrice of [0, 9000, 3]) {
      const node = await recovery.getNode(Side.LEND, unitPrice);
      expect(node.parent).to.equal(0);
      expect(node.left).to.equal(0);
      expect(node.right).to.equal(0);
      expect(node.red).to.equal(false);
      expect(node.orderCounter).to.equal(0);
      expect(node.orderTotalAmount).to.equal(0);
      expect(node.firstChunkId).to.equal(0);
      expect(node.activeChunkCount).to.equal(0);
    }
    for (const orderId of [1, 2]) {
      const placedOrder = await recovery.getPlacedOrder(orderId);
      expect(placedOrder.unitPrice).to.equal(0);
      expect(placedOrder.maturity).to.equal(0);
    }

    await expect(recovery.placeOrder(Side.LEND, owner.address, 300, 9000)).to
      .not.be.reverted;
    expect(await recovery.getRoot(Side.LEND)).to.equal(9000);
  });

  it('rejects a stale snapshot without making a partial change', async () => {
    await recovery.clearActiveOrderIds(Side.LEND, alice.address);
    await recovery.clearActiveOrderIds(Side.LEND, bob.address);
    const input = await buildRecoveryInput();
    input.orders[1].amount = BigNumber.from(input.orders[1].amount).add(1);

    await expect(executeRecovery(input)).to.be.revertedWith(
      'UnexpectedResidualTreeState',
    );
    expect(await recovery.getRoot(Side.LEND)).to.equal(input.expectedRoot);
    expect((await recovery.getPlacedOrder(1)).unitPrice).to.equal(9000);
    expect((await recovery.getPlacedOrder(2)).unitPrice).to.equal(3);
  });

  it('rejects recovery input that omits a reachable residual node', async () => {
    await recovery.clearActiveOrderIds(Side.LEND, alice.address);
    await recovery.clearActiveOrderIds(Side.LEND, bob.address);
    const input = await buildRecoveryInput();
    input.orders.pop();

    await expect(executeRecovery(input)).to.be.revertedWith(
      'UnexpectedResidualTreeState',
    );
    expect(await recovery.getRoot(Side.LEND)).to.equal(input.expectedRoot);
    expect((await recovery.getPlacedOrder(1)).unitPrice).to.equal(9000);
    expect((await recovery.getPlacedOrder(2)).unitPrice).to.equal(3);
  });

  it('rejects recovery while a residual order is still in a maker active-order array', async () => {
    const input = await buildRecoveryInput();

    await expect(executeRecovery(input)).to.be.revertedWith(
      'UnexpectedResidualTreeState',
    );
    expect(await recovery.getRoot(Side.LEND)).to.equal(input.expectedRoot);
  });
});
