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

    it('get on a non existing object returns (0,0,0,0,0,0).', async () => {
        const result = (await doubleLinkedList.get(0));
        result[0].toNumber().should.be.equal(0);
        result[1].toNumber().should.be.equal(0);
        result[2].toNumber().should.be.equal(0);
        result[3].toNumber().should.be.equal(0);
        result[4].toNumber().should.be.equal(0);
        result[5].toNumber().should.be.equal(0);
    });

    it('adds an object at the head - event emission.', async () => {
        const objectEvent = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0];
        objectEvent.args.id.toNumber().should.be.equal(1);
        objectEvent.args.amount.toNumber().should.be.equal(headAmount);
        objectEvent.args.orderId.toNumber().should.be.equal(headOrderId);
    });

    it('adds an object at the head - data storage.', async () => {
        const objectId = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

        const result = (await doubleLinkedList.get(objectId));
        result[0].toNumber().should.be.equal(objectId);
        result[1].toNumber().should.be.equal(0);
        result[2].toNumber().should.be.equal(0);
        // result[3].toNumber().should.be.equal(headData);
        result[4].toNumber().should.be.equal(headAmount);
        result[5].toNumber().should.be.equal(headOrderId);
    });

    it('adds two objects from the head.', async () => {
        const objectOneId = (
            await doubleLinkedList.addHead(middleAmount, middleOrderId)
        ).logs[0].args.id.toNumber();
        const objectTwoId = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

        const objectOne = (await doubleLinkedList.get(objectOneId));
        objectOne[0].toNumber().should.be.equal(objectOneId);
        objectOne[1].toNumber().should.be.equal(0);
        objectOne[2].toNumber().should.be.equal(objectTwoId);
        // objectOne[3].should.be.equal(middleData);
        objectOne[4].toNumber().should.be.equal(middleAmount);
        objectOne[5].toNumber().should.be.equal(middleOrderId);

        const objectTwo = (await doubleLinkedList.get(objectTwoId));
        objectTwo[0].toNumber().should.be.equal(objectTwoId);
        objectTwo[1].toNumber().should.be.equal(objectOneId);
        objectTwo[2].toNumber().should.be.equal(0);
        // objectTwo[3].should.be.equal(headData);
        objectTwo[4].toNumber().should.be.equal(headAmount);
        objectTwo[5].toNumber().should.be.equal(headOrderId);

        ((await doubleLinkedList.head()).toNumber()).should.be.equal(objectTwoId);
    });

    it('adds an object at the tail - event emission.', async () => {
        const objectEvent = (
            await doubleLinkedList.addTail(headAmount, headOrderId)
        ).logs[0];
        objectEvent.args.id.toNumber().should.be.equal(1);
        objectEvent.args.amount.toNumber().should.be.equal(headAmount);
        objectEvent.args.orderId.toNumber().should.be.equal(headOrderId);
    });

    it('adds an object at the tail - data storage.', async () => {
        const objectId = (
            await doubleLinkedList.addTail(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

        const result = (await doubleLinkedList.get(objectId));
        result[0].toNumber().should.be.equal(objectId);
        result[1].toNumber().should.be.equal(0);
        result[2].toNumber().should.be.equal(0);
        // result[3].should.be.equal(headData);
        result[4].toNumber().should.be.equal(headAmount);
        result[5].toNumber().should.be.equal(headOrderId);
    });

    it('adds two objects from the tail.', async () => {
        const objectOneId = (
            await doubleLinkedList.addTail(middleAmount, middleOrderId)
        ).logs[0].args.id.toNumber();
        const objectTwoId = (
            await doubleLinkedList.addTail(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

        const objectOne = (await doubleLinkedList.get(objectOneId));
        objectOne[0].toNumber().should.be.equal(objectOneId);
        objectOne[1].toNumber().should.be.equal(objectTwoId);
        objectOne[2].toNumber().should.be.equal(0);
        // objectOne[3].should.be.equal(middleData);
        objectOne[4].toNumber().should.be.equal(middleAmount);
        objectOne[5].toNumber().should.be.equal(middleOrderId);

        const objectTwo = (await doubleLinkedList.get(objectTwoId));
        objectTwo[0].toNumber().should.be.equal(objectTwoId);
        objectTwo[1].toNumber().should.be.equal(0);
        objectTwo[2].toNumber().should.be.equal(objectOneId);
        // objectTwo[3].should.be.equal(headData);
        objectTwo[4].toNumber().should.be.equal(headAmount);
        objectTwo[5].toNumber().should.be.equal(headOrderId);

        ((await doubleLinkedList.head()).toNumber()).should.be.equal(objectOneId);
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
        ).logs[0].args.id.toNumber();
        middleId = (
            await doubleLinkedList.addHead(middleAmount, middleOrderId)
        ).logs[0].args.id.toNumber();
        headId = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();
    });

    it('finds an id for given data.', async () => {
        let resultId = (await doubleLinkedList.findIdForAmount(headAmount));
        resultId.toNumber().should.be.equal(headId);
        resultId = (await doubleLinkedList.findIdForAmount(middleAmount));
        resultId.toNumber().should.be.equal(middleId);
        resultId = (await doubleLinkedList.findIdForAmount(tailAmount));
        resultId.toNumber().should.be.equal(tailId);
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
        ).logs[0].args.id.toNumber();
        middleId = (
            await doubleLinkedList.addHead(middleAmount, middleOrderId)
        ).logs[0].args.id.toNumber();
        headId = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

    });

    it('removes the head.', async () => {
        const removedId = (
            await doubleLinkedList.remove(headId)
        ).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(middleId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(tailId);
        middleObject[2].toNumber().should.be.equal(0);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);


        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(middleId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('removes the tail.', async () => {
        const removedId = (
            await doubleLinkedList.remove(tailId)
        ).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(0);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);
    });

    it('removes the middle.', async () => {
        const removedId = (
            await doubleLinkedList.remove(middleId)
        ).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(tailId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(headId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('removes all.', async () => {
        (await doubleLinkedList.remove(headId)).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(middleId);

        (await doubleLinkedList.remove(tailId)).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(middleId);
        ((await doubleLinkedList.tail()).toNumber()).should.be.equal(middleId);

        (await doubleLinkedList.remove(middleId)).logs[1].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(0);
        ((await doubleLinkedList.tail()).toNumber()).should.be.equal(0);
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
        ).logs[0].args.id.toNumber();
        middleId = (
            await doubleLinkedList.addHead(middleAmount, middleOrderId)
        ).logs[0].args.id.toNumber();
        headId = (
            await doubleLinkedList.addHead(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();

    });

    it('inserts after the head.', async () => {
        const insertedId = (
            await doubleLinkedList.insertAfter(headId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(insertedId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(middleId);
        insertedObject[2].toNumber().should.be.equal(headId);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(tailId);
        middleObject[2].toNumber().should.be.equal(insertedId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(middleId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('inserts after the tail.', async () => {
        const insertedId = (
            await doubleLinkedList.insertAfter(tailId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(tailId);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(insertedId);
        tailObject[2].toNumber().should.be.equal(middleId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(0);
        insertedObject[2].toNumber().should.be.equal(tailId);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);
    });

    it('inserts after the middle.', async () => {
        const insertedId = (
            await doubleLinkedList.insertAfter(middleId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(insertedId);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(tailId);
        insertedObject[2].toNumber().should.be.equal(middleId);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(insertedId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('inserts before the head.', async () => {
        const insertedId = (
            await doubleLinkedList.insertBefore(headId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(insertedId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(headId);
        insertedObject[2].toNumber().should.be.equal(0);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);        

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(insertedId);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(tailId);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(middleId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('inserts before the tail.', async () => {
        const insertedId = (
            await doubleLinkedList.insertBefore(tailId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(insertedId);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(tailId);
        insertedObject[2].toNumber().should.be.equal(middleId);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(insertedId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
    });

    it('inserts before the middle.', async () => {
        const insertedId = (
            await doubleLinkedList.insertBefore(middleId, insertedAmount, insertedOrderId)
        ).logs[0].args.id.toNumber();
        ((await doubleLinkedList.head()).toNumber()).should.be.equal(headId);

        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(insertedId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const insertedObject = (await doubleLinkedList.get(insertedId));
        insertedObject[0].toNumber().should.be.equal(insertedId);
        insertedObject[1].toNumber().should.be.equal(middleId);
        insertedObject[2].toNumber().should.be.equal(headId);
        // insertedObject[3].should.be.equal(insertedData);
        insertedObject[4].toNumber().should.be.equal(insertedAmount);
        insertedObject[5].toNumber().should.be.equal(insertedOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(tailId);
        middleObject[2].toNumber().should.be.equal(insertedId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const tailObject = (await doubleLinkedList.get(tailId));
        tailObject[0].toNumber().should.be.equal(tailId);
        tailObject[1].toNumber().should.be.equal(0);
        tailObject[2].toNumber().should.be.equal(middleId);
        // tailObject[3].should.be.equal(tailData);
        tailObject[4].toNumber().should.be.equal(tailAmount);
        tailObject[5].toNumber().should.be.equal(tailOrderId);
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
        ).logs[0].args.id.toNumber();
        headId = (
            await doubleLinkedList.insert(headAmount, headOrderId)
        ).logs[0].args.id.toNumber();
        equalId1 = (
            await doubleLinkedList.insert(equalAmount1, equalOrderId1)
            ).logs[0].args.id.toNumber();
        equalId2 = (
            await doubleLinkedList.insert(equalAmount2, equalOrderId2)
            ).logs[0].args.id.toNumber();
        equalId3 = (
            await doubleLinkedList.insert(equalAmount3, equalOrderId3)
            ).logs[0].args.id.toNumber();
    });

    it('check structured insert results.', async () => {
        const headObject = (await doubleLinkedList.get(headId));
        headObject[0].toNumber().should.be.equal(headId);
        headObject[1].toNumber().should.be.equal(middleId);
        headObject[2].toNumber().should.be.equal(0);
        // headObject[3].should.be.equal(headData);
        headObject[4].toNumber().should.be.equal(headAmount);
        headObject[5].toNumber().should.be.equal(headOrderId);

        const middleObject = (await doubleLinkedList.get(middleId));
        middleObject[0].toNumber().should.be.equal(middleId);
        middleObject[1].toNumber().should.be.equal(equalId1);
        middleObject[2].toNumber().should.be.equal(headId);
        // middleObject[3].should.be.equal(middleData);
        middleObject[4].toNumber().should.be.equal(middleAmount);
        middleObject[5].toNumber().should.be.equal(middleOrderId);

        const equalObject1 = (await doubleLinkedList.get(equalId1));
        equalObject1[0].toNumber().should.be.equal(equalId1);
        equalObject1[1].toNumber().should.be.equal(equalId2);
        equalObject1[2].toNumber().should.be.equal(middleId);
        // equalObject1[3].should.be.equal(equalData);
        equalObject1[4].toNumber().should.be.equal(equalAmount1);
        equalObject1[5].toNumber().should.be.equal(equalOrderId1);

        const equalObject2 = (await doubleLinkedList.get(equalId2));
        equalObject2[0].toNumber().should.be.equal(equalId2);
        equalObject2[1].toNumber().should.be.equal(equalId3);
        equalObject2[2].toNumber().should.be.equal(equalId1);
        // equalObject2[3].should.be.equal(equalData);
        equalObject2[4].toNumber().should.be.equal(equalAmount2);
        equalObject2[5].toNumber().should.be.equal(equalOrderId2);

        const equalObject3 = (await doubleLinkedList.get(equalId3));
        equalObject3[0].toNumber().should.be.equal(equalId3);
        equalObject3[1].toNumber().should.be.equal(0);
        equalObject3[2].toNumber().should.be.equal(equalId2);
        // equalObject3[3].should.be.equal(equalData);
        equalObject3[4].toNumber().should.be.equal(equalAmount3);
        equalObject3[5].toNumber().should.be.equal(equalOrderId3);
    });
});


/* contract('DoubleLinkedList - gas tests', (accounts) => {
    let doubleLinkedList: DoubleLinkedListInstance;
    const dummyData = '0x0000000000000000000000000000000000000001';

    beforeEach(async () => {
        doubleLinkedList = await DoubleLinkedList.new();
        for (let i = 0; i < 100; i++) {
            await doubleLinkedList.addHead(dummyData);
        }
    });

    it('Add Head.', async () => {
        await doubleLinkedList.addHead(dummyData);
    });

    it('Add Tail.', async () => {
        await doubleLinkedList.addTail(dummyData);
    });

    it('Insert After.', async () => {
        const tailId = await doubleLinkedList.tail();
        await doubleLinkedList.insertAfter(tailId, dummyData);
    });

    it('Insert Before.', async () => {
        const tailId = await doubleLinkedList.tail();
        await doubleLinkedList.insertBefore(tailId, dummyData);
    });

    it('Remove.', async () => {
        const tailId = await doubleLinkedList.tail();
        await doubleLinkedList.remove(tailId);
    });
}); */
