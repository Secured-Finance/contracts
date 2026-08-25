import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { artifacts } from 'hardhat';
import { verifyBlackHeightConsistency } from '../../common/tree-utils';

const OrderStatisticsTree = artifacts.require(
  'OrderStatisticsTreeContract.sol',
);

const PRICE = 8000;
const AMOUNT = 10;
const CHUNK_SIZE = 100;
const MAX_ACTIVE_CHUNKS_PER_PRICE = 2000;

describe('OrderStatisticsTree - order chunks', () => {
  let ost: Contract;

  beforeEach(async () => {
    ost = await OrderStatisticsTree.new();
  });

  function expectBn(actual: { toString(): string }, expected: number) {
    expect(actual.toString()).to.equal(expected.toString());
  }

  function smallNumber(actual: { toString(): string }) {
    return BigNumber.isBigNumber(actual)
      ? actual.toNumber()
      : Number(actual.toString());
  }

  function expectSmall(actual: { toString(): string }, expected: number) {
    expect(smallNumber(actual)).to.equal(expected);
  }

  async function insertOrders(
    count: number,
    price = PRICE,
    firstOrderId = 1,
    amount = AMOUNT,
  ) {
    for (let offset = 0; offset < count; offset += 100) {
      await ost.insertOrders(
        price,
        firstOrderId + offset,
        Math.min(100, count - offset),
        constants.AddressZero,
        amount,
      );
    }
  }

  async function assertChunkInvariants(
    price: number,
    activeOrderIds: number[],
  ) {
    const node = await ost.getNode(price);
    const metadata = await ost.getChunkMetadata(price);
    let chunkId = metadata.firstChunkId.toNumber();
    let previousChunkId = 0;
    let chunkCount = 0;
    let orderCount = BigNumber.from(0);
    let totalAmount = BigNumber.from(0);
    let firstOrderId = 0;

    while (chunkId !== 0) {
      const chunk = await ost.getChunk(price, chunkId);
      if (chunkCount === 0) firstOrderId = smallNumber(chunk.firstOrderId);
      expectSmall(chunk.prevChunkId, previousChunkId);
      expect(smallNumber(chunk.orderCount)).to.be.lte(CHUNK_SIZE);
      if (previousChunkId !== 0) {
        const previous = await ost.getChunk(price, previousChunkId);
        expectSmall(previous.nextChunkId, chunkId);
      }
      orderCount = orderCount.add(smallNumber(chunk.orderCount));
      totalAmount = totalAmount.add(chunk.totalAmount);
      previousChunkId = chunkId;
      chunkId = smallNumber(chunk.nextChunkId);
      chunkCount++;
    }

    expect(orderCount.toString()).to.equal(node._orderCounter.toString());
    expect(totalAmount.toString()).to.equal(node._orderTotalAmount.toString());
    const nodeOrderIds = await ost.getNodeOrderIds(price);
    const lastOrderId = nodeOrderIds.length
      ? smallNumber(nodeOrderIds[nodeOrderIds.length - 1])
      : 0;
    expectBn(node._head, firstOrderId);
    expectBn(node._tail, lastOrderId);
    expectBn(metadata.lastChunkId, previousChunkId);
    expect(chunkCount).to.equal(metadata.activeChunkCount.toNumber());
    expect(chunkCount).to.be.lte(MAX_ACTIVE_CHUNKS_PER_PRICE);
    for (const orderId of activeOrderIds) {
      expect(await ost.orderIdExists(price, orderId)).to.be.true;
    }
  }

  it(`creates chunks at the ${CHUNK_SIZE}-order boundary and writes explicit mappings only after the transition`, async () => {
    await insertOrders(CHUNK_SIZE);
    let metadata = await ost.getChunkMetadata(PRICE);
    let chunk = await ost.getChunk(PRICE, 1);
    expectBn(metadata.firstChunkId, 1);
    expectBn(metadata.lastChunkId, 1);
    expectBn(metadata.explicitMappingStartOrderId, 0);
    expectBn(metadata.activeChunkCount, 1);
    expectBn(await ost.getOrderChunkId(PRICE, 1), 0);
    expectBn(chunk.totalAmount, CHUNK_SIZE * 10);
    expectSmall(chunk.orderCount, CHUNK_SIZE);
    expectSmall(chunk.firstOrderId, 1);
    expectBn(await ost.getFutureValue(PRICE, 1), 13);
    expect(
      (await ost.getNodeOrderIds(PRICE)).map((orderId) => smallNumber(orderId)),
    ).to.deep.equal(
      Array.from({ length: CHUNK_SIZE }, (_, index) => index + 1),
    );

    await insertOrders(2, PRICE, CHUNK_SIZE + 1);
    metadata = await ost.getChunkMetadata(PRICE);
    chunk = await ost.getChunk(PRICE, 2);
    expectBn(metadata.explicitMappingStartOrderId, CHUNK_SIZE + 1);
    expectBn(metadata.activeChunkCount, 2);
    expectSmall((await ost.getChunk(PRICE, 1)).nextChunkId, 2);
    expectSmall(chunk.prevChunkId, 1);
    expectBn(chunk.totalAmount, 20);
    expectSmall(chunk.orderCount, 2);
    expectSmall(chunk.firstOrderId, CHUNK_SIZE + 1);
    expectBn(await ost.getOrderChunkId(PRICE, CHUNK_SIZE + 1), 2);
    await assertChunkInvariants(PRICE, [
      1,
      CHUNK_SIZE,
      CHUNK_SIZE + 1,
      CHUNK_SIZE + 2,
    ]);
  });

  it('updates aggregates for head, middle and tail cancellation and unlinks empty chunks', async () => {
    await insertOrders(CHUNK_SIZE * 2 + 1);
    await ost.removeAmountValue(PRICE, 1);
    await ost.removeAmountValue(PRICE, CHUNK_SIZE / 2);
    await ost.removeAmountValue(PRICE, CHUNK_SIZE);
    const first = await ost.getChunk(PRICE, 1);
    expectSmall(first.firstOrderId, 2);
    expectSmall(first.orderCount, CHUNK_SIZE - 3);
    expectBn(first.totalAmount, (CHUNK_SIZE - 3) * AMOUNT);
    for (let orderId = CHUNK_SIZE + 1; orderId <= CHUNK_SIZE * 2; orderId++) {
      await ost.removeAmountValue(PRICE, orderId);
    }
    const metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.firstChunkId, 1);
    expectBn(metadata.lastChunkId, 3);
    expectBn(metadata.activeChunkCount, 2);
    expectSmall((await ost.getChunk(PRICE, 1)).nextChunkId, 3);
    expectSmall((await ost.getChunk(PRICE, 3)).prevChunkId, 1);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE / 2)).to.be.false;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE * 2)).to.be.false;
    expect(await ost.orderIdExists(PRICE, (CHUNK_SIZE * 3) / 2)).to.be.false;
    await assertChunkInvariants(PRICE, [2, CHUNK_SIZE - 1, CHUNK_SIZE * 2 + 1]);
  }).timeout(180000);

  it('resolves orders after multi to single to multi transitions', async () => {
    await insertOrders(CHUNK_SIZE + 1);
    for (let orderId = 1; orderId <= CHUNK_SIZE; orderId++) {
      await ost.removeAmountValue(PRICE, orderId);
    }
    expectBn((await ost.getChunkMetadata(PRICE)).activeChunkCount, 1);
    await insertOrders(CHUNK_SIZE, PRICE, CHUNK_SIZE + 2);
    expectBn((await ost.getChunkMetadata(PRICE)).activeChunkCount, 2);
    await ost.removeAmountValue(PRICE, CHUNK_SIZE + 1);
    await ost.removeAmountValue(PRICE, (CHUNK_SIZE * 3) / 2);
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE + 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, (CHUNK_SIZE * 3) / 2)).to.be.false;
    await assertChunkInvariants(PRICE, [
      CHUNK_SIZE + 2,
      (CHUNK_SIZE * 3) / 2 - 1,
      (CHUNK_SIZE * 3) / 2 + 1,
      CHUNK_SIZE * 2 + 1,
    ]);
  }).timeout(180000);

  it('tracks active chunks rather than the allocated chunk-id span after fragmentation', async () => {
    await insertOrders(CHUNK_SIZE * 9 + 1);
    for (
      let orderId = CHUNK_SIZE * 3 + 1;
      orderId <= CHUNK_SIZE * 9;
      orderId++
    ) {
      await ost.removeAmountValue(PRICE, orderId);
    }
    let metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.firstChunkId, 1);
    expectBn(metadata.lastChunkId, 10);
    expectBn(metadata.lastAllocatedChunkId, 10);
    expectBn(metadata.activeChunkCount, 4);
    expectSmall((await ost.getChunk(PRICE, 1)).nextChunkId, 2);
    expectSmall((await ost.getChunk(PRICE, 10)).prevChunkId, 3);

    await insertOrders(CHUNK_SIZE * 3, PRICE, CHUNK_SIZE * 9 + 2);
    metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.lastAllocatedChunkId, 13);
    expectBn(metadata.activeChunkCount, 7);
    await assertChunkInvariants(PRICE, [
      1,
      CHUNK_SIZE * 3,
      CHUNK_SIZE * 9 + 1,
      CHUNK_SIZE * 9 + 2,
      CHUNK_SIZE * 12 + 1,
    ]);
  }).timeout(180000);

  it('recovers capacity when the last insertion chunk is emptied and allocates a new id', async () => {
    await insertOrders(CHUNK_SIZE + 1);
    await ost.removeAmountValue(PRICE, CHUNK_SIZE + 1);
    let metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.lastChunkId, 1);
    expectBn(metadata.lastAllocatedChunkId, 2);
    expectBn(metadata.activeChunkCount, 1);

    await insertOrders(1, PRICE, CHUNK_SIZE + 2);
    metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.lastChunkId, 3);
    expectBn(metadata.lastAllocatedChunkId, 3);
    expectBn(metadata.activeChunkCount, 2);
    await assertChunkInvariants(PRICE, [1, CHUNK_SIZE, CHUNK_SIZE + 2]);
  });

  it('removes complete chunks and partially fills the boundary order', async () => {
    await insertOrders(CHUNK_SIZE * 2 + 5);
    const result = await ost.removeOrders.call(
      PRICE,
      (CHUNK_SIZE + 1) * AMOUNT + 5,
    );
    expectSmall(result.orderId, CHUNK_SIZE + 2);
    expectBn(result.amount, 5);
    await ost.removeOrders(PRICE, (CHUNK_SIZE + 1) * AMOUNT + 5);
    const node = await ost.getNode(PRICE);
    const boundary = await ost.getOrder(PRICE, CHUNK_SIZE + 2);
    expectBn(node._head, CHUNK_SIZE + 2);
    expectBn(node._tail, CHUNK_SIZE * 2 + 5);
    expectBn(node._orderCounter, CHUNK_SIZE + 4);
    expectBn(node._orderTotalAmount, (CHUNK_SIZE + 3) * AMOUNT + 5);
    expectBn(boundary.amount, 5);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE + 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE + 2)).to.be.true;
    await assertChunkInvariants(PRICE, [
      CHUNK_SIZE + 2,
      CHUNK_SIZE * 2,
      CHUNK_SIZE * 2 + 5,
    ]);
  });

  it('removes an exact order boundary without returning a partial order', async () => {
    await insertOrders(3);
    const result = await ost.removeOrders.call(PRICE, AMOUNT * 2);
    expectSmall(result.orderId, 0);
    expectBn(result.amount, 0);

    await ost.removeOrders(PRICE, AMOUNT * 2);
    const node = await ost.getNode(PRICE);
    expectBn(node._head, 3);
    expectBn(node._tail, 3);
    expectBn(node._orderCounter, 1);
    expectBn(node._orderTotalAmount, AMOUNT);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, 2)).to.be.false;
    await assertChunkInvariants(PRICE, [3]);
  });

  it('unlinks every chunk when the complete price-level amount is removed', async () => {
    await insertOrders(CHUNK_SIZE + 1);
    await ost.removeOrders(PRICE, (CHUNK_SIZE + 1) * AMOUNT);

    const node = await ost.getNode(PRICE);
    const metadata = await ost.getChunkMetadata(PRICE);
    expectBn(node._head, 0);
    expectBn(node._tail, 0);
    expectBn(node._orderCounter, 0);
    expectBn(node._orderTotalAmount, 0);
    expectBn(metadata.firstChunkId, 0);
    expectBn(metadata.lastChunkId, 0);
    expectBn(metadata.explicitMappingStartOrderId, 0);
    expectBn(metadata.activeChunkCount, 0);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE + 1)).to.be.false;
  });

  it('keeps chunk metadata valid through dropLeft and dropRight boundary removals', async () => {
    await insertOrders(2, 7000, 1);
    await insertOrders(CHUNK_SIZE * 3 + 5, 8000, 3);
    await insertOrders(2, 9000, CHUNK_SIZE * 3 + 8);
    await ost.dropValuesFromFirst(25, 0, 0);
    expectBn(await ost.firstValue(), 8000);
    expect(await ost.orderIdExists(7000, 1)).to.be.true;
    expect(await ost.isActiveOrderId(7000, 1)).to.be.false;
    expect(await ost.orderIdExists(8000, 3)).to.be.true;
    expectBn((await ost.getOrder(8000, 3)).amount, 5);
    expect(await ost.orderIdExists(8000, 4)).to.be.true;
    await assertChunkInvariants(8000, [3, 4, CHUNK_SIZE * 3 + 7]);
    expect(await verifyBlackHeightConsistency(ost)).to.be.true;

    await ost.dropValuesFromLast(25, 0, 0);
    expectBn(await ost.lastValue(), 8000);
    expect(await ost.orderIdExists(9000, CHUNK_SIZE * 3 + 8)).to.be.true;
    expect(await ost.isActiveOrderId(9000, CHUNK_SIZE * 3 + 8)).to.be.false;
    expect(await ost.orderIdExists(8000, 3)).to.be.false;
    await assertChunkInvariants(8000, [4, CHUNK_SIZE * 3 + 5]);
    expect(await verifyBlackHeightConsistency(ost)).to.be.true;
  });

  it('migrates legacy single and multiple chunks and preserves orderIdExists', async () => {
    for (let orderId = 1; orderId <= CHUNK_SIZE + 1; orderId++) {
      await ost.insertLegacyOrder(
        PRICE,
        orderId,
        constants.AddressZero,
        AMOUNT,
      );
    }
    expectBn((await ost.getChunkMetadata(PRICE)).firstChunkId, 0);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.true;
    expect(await ost.orderIdExists(PRICE, CHUNK_SIZE + 1)).to.be.true;
    await ost.migrateOrderChunks(PRICE);
    const metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.firstChunkId, 1);
    expectBn(metadata.lastChunkId, 2);
    expectBn(metadata.explicitMappingStartOrderId, CHUNK_SIZE + 1);
    expectBn(metadata.activeChunkCount, 2);
    await assertChunkInvariants(PRICE, [1, CHUNK_SIZE, CHUNK_SIZE + 1]);
    await expect(ost.migrateOrderChunks(PRICE)).to.be.revertedWith(
      'Already migrated',
    );
    await expect(ost.migrateOrderChunks(9999)).to.be.revertedWith(
      'Value does not exist',
    );
    await insertOrders(1, PRICE, CHUNK_SIZE + 2);
    await ost.removeAmountValue(PRICE, CHUNK_SIZE / 2);
    await ost.removeOrders(PRICE, 10);
    await assertChunkInvariants(PRICE, [
      2,
      CHUNK_SIZE,
      CHUNK_SIZE + 1,
      CHUNK_SIZE + 2,
    ]);
  }).timeout(180000);

  it('lazily builds chunk metadata before inserting into a legacy price level', async () => {
    await ost.insertLegacyOrder(PRICE, 1, constants.AddressZero, AMOUNT);
    expectBn((await ost.getChunkMetadata(PRICE)).firstChunkId, 0);

    await insertOrders(1, PRICE, 2);
    const metadata = await ost.getChunkMetadata(PRICE);
    expectBn(metadata.firstChunkId, 1);
    expectBn(metadata.lastChunkId, 1);
    expectBn(metadata.activeChunkCount, 1);
    await assertChunkInvariants(PRICE, [1, 2]);
  });

  it('rejects stale order ids across repeated price-node lifecycles', async () => {
    await insertOrders(2);
    await ost.removeAmountValue(PRICE, 1);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, 2)).to.be.true;
    await ost.removeAmountValue(PRICE, 2);
    await insertOrders(2, PRICE, 3);
    expect(await ost.orderIdExists(PRICE, 1)).to.be.false;
    expect(await ost.orderIdExists(PRICE, 2)).to.be.false;
    expect(await ost.orderIdExists(PRICE, 3)).to.be.true;
    expect(await ost.orderIdExists(PRICE, 4)).to.be.true;
    await ost.removeAmountValue(PRICE, 3);
    await ost.removeAmountValue(PRICE, 4);
    await insertOrders(1, PRICE, 5);
    expect(await ost.orderIdExists(PRICE, 3)).to.be.false;
    expect(await ost.orderIdExists(PRICE, 5)).to.be.true;
  });
});
