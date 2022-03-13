const DoubleLinkedList = artifacts.require('DoubleLinkedList');
const { should } = require('chai');
should();

const emptyData = 0;

const headAmount = 10;
const headOrderId = 1;

const middleAmount = 5000;
const middleOrderId = 2;

const tailAmount = 10000;
const tailOrderId = 3;

const equalAmount1 = 10000;
const equalOrderId1 = 4;

const equalAmount2 = 10000;
const equalOrderId2 = 5;

const equalAmount3 = 10000;
const equalOrderId3 = 6;

/** @test {DoubleLinkedList} contract */
contract('DoubleLinkedList - add', (accounts) => {
  let doubleLinkedList;

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
  });

  /**
   * Test the two contract methods
   * @test {DoubleLinkedList#set} and {DoubleLinkedList#get}
   */
  it('Constructor variables.', async () => {
    (await doubleLinkedList.idCounter()).toNumber().should.be.equal(1);
  });

  it('get on a non existing object returns (0,0,0,0,0).', async () => {
    const result = await doubleLinkedList.get(0);
    result[0].toNumber().should.be.equal(0);
    result[1].toNumber().should.be.equal(0);
    result[2].toNumber().should.be.equal(0);
    result[3].toNumber().should.be.equal(0);
    result[4].toNumber().should.be.equal(0);
  });

  it('adds an object at the head - event emission.', async () => {
    const objectEvent = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0];
    objectEvent.args.amount.toNumber().should.be.equal(headAmount);
    objectEvent.args.orderId.toNumber().should.be.equal(headOrderId);
  });

  it('adds an object at the head - data storage.', async () => {
    const objectId = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();

    const result = await doubleLinkedList.get(objectId);
    result[0].toNumber().should.be.equal(headOrderId);
    result[1].toNumber().should.be.equal(0);
    result[2].toNumber().should.be.equal(0);
    // result[3].toNumber().should.be.equal(headData);
    result[4].toNumber().should.be.equal(headAmount);
  });

  it('adds two objects from the head.', async () => {
    const objectOneId = (
      await doubleLinkedList.addHead(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    const objectTwoId = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();

    const objectOne = await doubleLinkedList.get(objectOneId);
    objectOne[0].toNumber().should.be.equal(middleOrderId);
    objectOne[1].toNumber().should.be.equal(0);
    objectOne[2].toNumber().should.be.equal(objectTwoId);
    // objectOne[3].should.be.equal(middleData);
    objectOne[4].toNumber().should.be.equal(middleAmount);

    const objectTwo = await doubleLinkedList.get(objectTwoId);
    objectTwo[0].toNumber().should.be.equal(headOrderId);
    objectTwo[1].toNumber().should.be.equal(objectOneId);
    objectTwo[2].toNumber().should.be.equal(0);
    // objectTwo[3].should.be.equal(headData);
    objectTwo[4].toNumber().should.be.equal(headAmount);

    (await doubleLinkedList.head()).toNumber().should.be.equal(objectTwoId);
  });

  it('adds an object at the tail - event emission.', async () => {
    const objectEvent = (
      await doubleLinkedList.addTail(headAmount, headOrderId)
    ).logs[0];
    objectEvent.args.orderId.toNumber().should.be.equal(1);
    objectEvent.args.amount.toNumber().should.be.equal(headAmount);
    objectEvent.args.orderId.toNumber().should.be.equal(headOrderId);
  });

  it('adds an object at the tail - data storage.', async () => {
    const objectId = (
      await doubleLinkedList.addTail(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();

    const result = await doubleLinkedList.get(objectId);
    result[0].toNumber().should.be.equal(headOrderId);
    result[1].toNumber().should.be.equal(0);
    result[2].toNumber().should.be.equal(0);
    // result[3].should.be.equal(headData);
    result[4].toNumber().should.be.equal(headAmount);
  });

  it('adds two objects from the tail.', async () => {
    const objectOneId = (
      await doubleLinkedList.addTail(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    const objectTwoId = (
      await doubleLinkedList.addTail(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();

    const objectOne = await doubleLinkedList.get(objectOneId);
    objectOne[0].toNumber().should.be.equal(middleOrderId);
    objectOne[1].toNumber().should.be.equal(headOrderId);
    objectOne[2].toNumber().should.be.equal(0);
    // objectOne[3].should.be.equal(middleData);
    objectOne[4].toNumber().should.be.equal(middleAmount);

    const objectTwo = await doubleLinkedList.get(objectTwoId);
    objectTwo[0].toNumber().should.be.equal(headOrderId);
    objectTwo[1].toNumber().should.be.equal(0);
    objectTwo[2].toNumber().should.be.equal(middleOrderId);
    // objectTwo[3].should.be.equal(headData);
    objectTwo[4].toNumber().should.be.equal(headAmount);

    (await doubleLinkedList.head()).toNumber().should.be.equal(objectOneId);
  });
});

contract('DoubleLinkedList - find', (accounts) => {
  let doubleLinkedList;
  let headId;
  let middleId;
  let tailId;

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
    tailId = (
      await doubleLinkedList.addHead(tailAmount, tailOrderId)
    ).logs[0].args.orderId.toNumber();
    middleId = (
      await doubleLinkedList.addHead(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    headId = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();
  });

  it('finds an id for given data.', async () => {
    let resultId = await doubleLinkedList.findIdForAmount(headAmount);
    resultId.toNumber().should.be.equal(headOrderId);
    resultId = await doubleLinkedList.findIdForAmount(middleAmount);
    resultId.toNumber().should.be.equal(middleOrderId);
    resultId = await doubleLinkedList.findIdForAmount(tailAmount);
    resultId.toNumber().should.be.equal(tailOrderId);
  });
});

/** @test {doubleLinkedList} contract */
contract('DoubleLinkedList - remove', (accounts) => {
  let doubleLinkedList;
  let headId;
  let middleId;
  let tailId;

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
    tailId = (
      await doubleLinkedList.addHead(tailAmount, tailOrderId)
    ).logs[0].args.orderId.toNumber();
    middleId = (
      await doubleLinkedList.addHead(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    headId = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();
  });

  it('removes the head.', async () => {
    const removedId = (
      await doubleLinkedList.remove(headId)
    ).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(middleId);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(tailOrderId);
    middleObject[2].toNumber().should.be.equal(0);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(middleOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('removes the tail.', async () => {
    const removedId = (
      await doubleLinkedList.remove(tailId)
    ).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(middleOrderId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(0);
    middleObject[2].toNumber().should.be.equal(headOrderId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);
  });

  it('removes the middle.', async () => {
    const removedId = (
      await doubleLinkedList.remove(middleId)
    ).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(tailOrderId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(headOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('removes all.', async () => {
    (await doubleLinkedList.remove(headId)).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(middleOrderId);

    (await doubleLinkedList.remove(tailId)).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(middleOrderId);
    (await doubleLinkedList.tail()).toNumber().should.be.equal(middleOrderId);

    (await doubleLinkedList.remove(middleId)).logs[1].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(0);
    (await doubleLinkedList.tail()).toNumber().should.be.equal(0);
  });
});

/** @test {doubleLinkedList} contract */
contract('DoubleLinkedList - insert', (accounts) => {
  const insertedAmount = 1000;
  const insertedOrderId = 4;

  let doubleLinkedList;
  let headId;
  let middleId;
  let tailId;

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
    tailId = (
      await doubleLinkedList.addHead(tailAmount, tailOrderId)
    ).logs[0].args.orderId.toNumber();
    middleId = (
      await doubleLinkedList.addHead(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    headId = (
      await doubleLinkedList.addHead(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();
  });

  it('inserts after the head.', async () => {
    const insertedId = (
      await doubleLinkedList.insertAfter(
        headId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(insertedId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(middleId);
    insertedObject[2].toNumber().should.be.equal(headId);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(tailId);
    middleObject[2].toNumber().should.be.equal(insertedId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(middleId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('inserts after the tail.', async () => {
    const insertedId = (
      await doubleLinkedList.insertAfter(
        tailId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(middleId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(tailId);
    middleObject[2].toNumber().should.be.equal(headId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(insertedId);
    tailObject[2].toNumber().should.be.equal(middleId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(0);
    insertedObject[2].toNumber().should.be.equal(tailId);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);
  });

  it('inserts after the middle.', async () => {
    const insertedId = (
      await doubleLinkedList.insertAfter(
        middleId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(middleOrderId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(insertedOrderId);
    middleObject[2].toNumber().should.be.equal(headOrderId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(tailOrderId);
    insertedObject[2].toNumber().should.be.equal(middleOrderId);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(insertedOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('inserts before the head.', async () => {
    const insertedId = (
      await doubleLinkedList.insertBefore(
        headId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(insertedId);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(headOrderId);
    insertedObject[2].toNumber().should.be.equal(0);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(middleOrderId);
    headObject[2].toNumber().should.be.equal(insertedOrderId);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(tailOrderId);
    middleObject[2].toNumber().should.be.equal(headOrderId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(middleOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('inserts before the tail.', async () => {
    const insertedId = (
      await doubleLinkedList.insertBefore(
        tailId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(middleOrderId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(insertedOrderId);
    middleObject[2].toNumber().should.be.equal(headOrderId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(tailOrderId);
    insertedObject[2].toNumber().should.be.equal(middleOrderId);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(insertedOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });

  it('inserts before the middle.', async () => {
    const insertedId = (
      await doubleLinkedList.insertBefore(
        middleId,
        insertedAmount,
        insertedOrderId,
      )
    ).logs[0].args.orderId.toNumber();
    (await doubleLinkedList.head()).toNumber().should.be.equal(headId);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(insertedOrderId);
    headObject[2].toNumber().should.be.equal(0);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const insertedObject = await doubleLinkedList.get(insertedId);
    insertedObject[0].toNumber().should.be.equal(insertedOrderId);
    insertedObject[1].toNumber().should.be.equal(middleOrderId);
    insertedObject[2].toNumber().should.be.equal(headOrderId);
    // insertedObject[3].should.be.equal(insertedData);
    insertedObject[4].toNumber().should.be.equal(insertedAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(tailOrderId);
    middleObject[2].toNumber().should.be.equal(insertedOrderId);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const tailObject = await doubleLinkedList.get(tailId);
    tailObject[0].toNumber().should.be.equal(tailOrderId);
    tailObject[1].toNumber().should.be.equal(0);
    tailObject[2].toNumber().should.be.equal(middleOrderId);
    // tailObject[3].should.be.equal(tailData);
    tailObject[4].toNumber().should.be.equal(tailAmount);
  });
});

contract('DoubleLinkedList - findLastIdForAmount', (accounts) => {
  let doubleLinkedList;
  let headId;
  let middleId;
  let tailId;
  let equalId1;
  let equalId2;
  let equalId3;

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
    middleId = (
      await doubleLinkedList.insert(middleAmount, middleOrderId)
    ).logs[0].args.orderId.toNumber();
    headId = (
      await doubleLinkedList.insert(headAmount, headOrderId)
    ).logs[0].args.orderId.toNumber();
    equalId1 = (
      await doubleLinkedList.insert(equalAmount1, equalOrderId1)
    ).logs[0].args.orderId.toNumber();
    equalId2 = (
      await doubleLinkedList.insert(equalAmount2, equalOrderId2)
    ).logs[0].args.orderId.toNumber();
    equalId3 = (
      await doubleLinkedList.insert(equalAmount3, equalOrderId3)
    ).logs[0].args.orderId.toNumber();

    let newOrder = (
      await doubleLinkedList.insert(100, 7)
    ).logs[0].args.orderId.toNumber();

    let newOrder2 = (
      await doubleLinkedList.insert(150, 8)
    ).logs[0].args.orderId.toNumber();

    let newOrder3 = (
      await doubleLinkedList.insert(5, 9)
    ).logs[0].args.orderId.toNumber();

    let newOrder4 = (
      await doubleLinkedList.insert(1000000, 10)
    ).logs[0].args.orderId.toNumber();

    let newOrder5 = (
      await doubleLinkedList.insert(45000, 11)
    ).logs[0].args.orderId.toNumber();

    let newOrder6 = (
      await doubleLinkedList.insert(47500, 12)
    ).logs[0].args.orderId.toNumber();

    let newOrder7 = (
      await doubleLinkedList.insert(2500, 13)
    ).logs[0].args.orderId.toNumber();
  });

  it('check structured insert results.', async () => {
    const firstObject = await doubleLinkedList.get(9);
    firstObject[0].toNumber().should.be.equal(9);
    firstObject[1].toNumber().should.be.equal(headOrderId);
    firstObject[2].toNumber().should.be.equal(0);
    firstObject[4].toNumber().should.be.equal(5);

    const headObject = await doubleLinkedList.get(headId);
    headObject[0].toNumber().should.be.equal(headOrderId);
    headObject[1].toNumber().should.be.equal(7);
    headObject[2].toNumber().should.be.equal(9);
    // headObject[3].should.be.equal(headData);
    headObject[4].toNumber().should.be.equal(headAmount);

    const middleObject = await doubleLinkedList.get(middleId);
    middleObject[0].toNumber().should.be.equal(middleOrderId);
    middleObject[1].toNumber().should.be.equal(equalOrderId1);
    middleObject[2].toNumber().should.be.equal(13);
    // middleObject[3].should.be.equal(middleData);
    middleObject[4].toNumber().should.be.equal(middleAmount);

    const equalObject1 = await doubleLinkedList.get(equalId1);
    equalObject1[0].toNumber().should.be.equal(equalOrderId1);
    equalObject1[1].toNumber().should.be.equal(equalOrderId2);
    equalObject1[2].toNumber().should.be.equal(middleOrderId);
    // equalObject1[3].should.be.equal(equalData);
    equalObject1[4].toNumber().should.be.equal(equalAmount1);

    const equalObject2 = await doubleLinkedList.get(equalId2);
    equalObject2[0].toNumber().should.be.equal(equalOrderId2);
    equalObject2[1].toNumber().should.be.equal(equalOrderId3);
    equalObject2[2].toNumber().should.be.equal(equalOrderId1);
    // equalObject2[3].should.be.equal(equalData);
    equalObject2[4].toNumber().should.be.equal(equalAmount2);

    const object = await doubleLinkedList.get(equalId3);
    object[0].toNumber().should.be.equal(equalOrderId3);
    object[1].toNumber().should.be.equal(11);
    object[2].toNumber().should.be.equal(equalOrderId2);
    object[4].toNumber().should.be.equal(equalAmount3);

    const object2 = await doubleLinkedList.get(11);
    object2[0].toNumber().should.be.equal(11);
    object2[1].toNumber().should.be.equal(12);
    object2[2].toNumber().should.be.equal(equalOrderId3);
    object2[4].toNumber().should.be.equal(45000);

    const object3 = await doubleLinkedList.get(12);
    object3[0].toNumber().should.be.equal(12);
    object3[1].toNumber().should.be.equal(10);
    object3[2].toNumber().should.be.equal(11);
    object3[4].toNumber().should.be.equal(47500);

    const object4 = await doubleLinkedList.get(10);
    object4[0].toNumber().should.be.equal(10);
    object4[1].toNumber().should.be.equal(0);
    object4[2].toNumber().should.be.equal(12);
    object4[4].toNumber().should.be.equal(1000000);

    const object5 = await doubleLinkedList.get(8);
    object5[0].toNumber().should.be.equal(8);
    object5[1].toNumber().should.be.equal(13);
    object5[2].toNumber().should.be.equal(7);
    object5[4].toNumber().should.be.equal(150);

    const object6 = await doubleLinkedList.get(13);
    object6[0].toNumber().should.be.equal(13);
    object6[1].toNumber().should.be.equal(middleOrderId);
    object6[2].toNumber().should.be.equal(8);
    object6[4].toNumber().should.be.equal(2500);
  });
});

contract('DoubleLinkedList - gas tests', (accounts) => {
  let doubleLinkedList;
  const dummyData = '0x0000000000000000000000000000000000000001';

  beforeEach(async () => {
    doubleLinkedList = await DoubleLinkedList.new();
    for (let i = 0; i < 100; i++) {
      await doubleLinkedList.addHead(dummyData, 0);
    }
  });

  it('Add Head.', async () => {
    await doubleLinkedList.addHead(dummyData, 1);
  });

  it('Add Tail.', async () => {
    await doubleLinkedList.addTail(dummyData, 2);
  });

  it('Insert After.', async () => {
    const tailId = await doubleLinkedList.tail();
    await doubleLinkedList.insertAfter(tailId, dummyData, 3);
  });

  it('Insert Before.', async () => {
    const tailId = await doubleLinkedList.tail();
    await doubleLinkedList.insertBefore(tailId, dummyData, 4);
  });

  it('Remove.', async () => {
    const tailId = await doubleLinkedList.tail();
    await doubleLinkedList.remove(tailId);
  });
});
