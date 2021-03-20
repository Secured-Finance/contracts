//const BigNumber = require('big-number');
const OrderStatisticsTree = artifacts.require("HitchensOrderStatisticsTree.sol");
const fs = require('fs');
let ost;
let scenarios = [];

contract("OrderStatisticsTree - sort and rank", accounts => {

    beforeEach(async () => {;
        ost = await OrderStatisticsTree.new();
    });

    it("should be ready to test", async () => {
        assert.strictEqual(true, true, "something is wrong");
    });

    it("should process scenario 3", async () => {
        let steps = await loadSteps();   
        console.log("Number of steps: "+steps.length);  
        let s = await loadScenario2(steps);
        await printScenario(steps);
        await printExists(steps);
    });

});

async function loadSteps() {
    let rawdata = fs.readFileSync('./steps.json');
    steps = JSON.parse(rawdata);
    return steps
}

async function printExists(s) {
    console.log();
    console.log("See if values exists");
    console.log("value, exists");
    for(i=0; i < s.length; i++) {
        element = s[i]["rate"];
        if (element > 0) {
            exists = await ost.valueExists(element);
            console.log(element, exists);
        }
    }
}

async function printScenario(s) {
    let count;
    let first;
    let last;
    let rootVal;
    let n;
    let node;
    let orderCount;

    // enumerate the sorted list and stats
    console.log("element, orderCount")
    for(i=0; i < s.length; i++) {
        element = s[i]['rate'];
        orderCount = await ost.getValueCount(element);
        console.log(element, orderCount.toString(10));
    }
    
    // tree structure summary
    console.log();
    console.log("Tree Properties");
    rootCount = await ost.getRootCount();
    first = await ost.firstValue();
    last = await ost.lastValue();
    rootVal = await ost.treeRootNode();

    rootCount = rootCount.toString(10);
    first = first.toString(10);
    last = last.toString(10);
    rootVal = rootVal.toString(10);

    console.log("Root Count", rootCount);
    console.log("First", first);
    console.log("Last", last);
    console.log("Root Value", rootVal);

    // enumerate the node contents
    console.log();
    console.log("Node Details, (crawled in order), value, parent, left, right, red, head, tail, orderCounter");

    n = first;
    while(parseInt(n) > 0) {
        node = await ost.getNode(n);
        console.log(
            n,
            node[0].toString(10), 
            node[1].toString(10),
            node[2].toString(10),
            node[3],
            node[4].toString(10),
            node[5].toString(10),
            node[6].toString(10)
        )
        n = await ost.nextValue(n);
        n = n.toString(10);
    }
}

async function loadScenario2(steps) {
    let element;
    let sorted = [];
    let removeIndex;

    for(i=0; i < steps.length; i++) {
        element = steps[i]["amount"];
        orderId = steps[i]["orderId"];
        rate = steps[i]["rate"];
        if (element > 0) {
            sorted.push(rate);
            await ost.insertAmountValue(element, rate, orderId);
        } 
        // else {
        //     removeIndex = sorted.indexOf(element*-1);
        //     sorted.splice(removeIndex,1);
        //     await ost.removeAmountValue(rate, element*-1, orderId);
        // }
    }
    sorted.sort(numeric);
    return sorted;
}

function numeric(a, b) {
    return a - b;
}