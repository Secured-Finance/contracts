const scenario1 = 'test/order-statistic-tree/steps_1.json';
const scenario2 = 'test/order-statistic-tree/steps_2.json';
const scenario3 = 'test/order-statistic-tree/steps_3.json';
fs = require('fs');

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function main() {
    let rawdata = fs.readFileSync('./test_steps.json');
    steps = JSON.parse(rawdata);

    newArray = [...steps];
    var file = fs.createWriteStream('test_steps_delete.json');

    file.on('error', function(err) { /* error handling */ });

    file.write('[');

    for (i=0; i < newArray.length; i++) {
        number = getRandomInt(0, 10000);
        if (newArray[i]['action'] == "insert") {
            newObject = {
                "action": "delete",
                "amount": newArray[i]['amount'],
                "rate": newArray[i]['rate'],
                "orderId": newArray[i]['orderId'],
            }
            file.write(JSON.stringify(newObject, null, 2))
            file.write(',');    
        }
    }

    file.write(']');

    file.end();
}

main();