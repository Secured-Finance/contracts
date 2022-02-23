const FXRatesAggregator = artifacts.require('FXRatesAggregator');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { emitted, reverted, equal } = require('../test-utils').assert;
const { hexFILString, hexBTCString, hexETHString } = require('../test-utils').strings;

const expectRevert = reverted;

contract('FXRatesAggregator', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let fxRatesAggregator;
    let btcToUSDPriceFeed;
    let btcToETHPriceFeed;
    let ethToUSDPriceFeed;
    let filToUSDPriceFeed;
    let filToETHPriceFeed;

    before('deploy FXRatesAggregator and Mock Chainlink price feeds', async () => {
        fxRatesAggregator = await FXRatesAggregator.new();

        btcToUSDPriceFeed = await MockV3Aggregator.new(8, hexBTCString, 5612587723563);
        let setPriceFeedTx = await fxRatesAggregator.linkPriceFeed(3, btcToUSDPriceFeed.address, false);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');
    
        filToUSDPriceFeed = await MockV3Aggregator.new(8, hexFILString, 15804000000);
        setPriceFeedTx = await fxRatesAggregator.linkPriceFeed(1, filToUSDPriceFeed.address, false);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');

        ethToUSDPriceFeed = await MockV3Aggregator.new(8, hexETHString, 232612637168);
        setPriceFeedTx = await fxRatesAggregator.linkPriceFeed(0, ethToUSDPriceFeed.address, false);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');

        await expectRevert(
            fxRatesAggregator.linkPriceFeed(0, ethToUSDPriceFeed.address, true), 
            "Can't link ETH PriceFeed"
        );

        btcToETHPriceFeed = await MockV3Aggregator.new(18, hexBTCString, web3.utils.toBN(23889912590000000000));
        setPriceFeedTx = await fxRatesAggregator.linkPriceFeed(3, btcToETHPriceFeed.address, true);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');
        
        filToETHPriceFeed = await MockV3Aggregator.new(18, hexFILString, web3.utils.toBN(67175250000000000));
        setPriceFeedTx = await fxRatesAggregator.linkPriceFeed(1, filToETHPriceFeed.address, true);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');
    });

    describe('Test getLastUSDPrice and getHistoricalPrice for ETH', async () => {
        it('Succesfully get last price for ETH in USD', async () => {
            let price = await fxRatesAggregator.getLastUSDPrice(0, {from: bob});
            await equal(price.toString(), '232612637168');
        });

        it('Try to get later round price, expect revert', async () => {
            await expectRevert(
                fxRatesAggregator.getHistoricalUSDPrice(0, 2, {from: bob}), 
                "Round not completed yet"
            );
        });
    });

    describe('Test getLastUSDPrice and getHistoricalPrice for FIL', async () => {
        it('Succesfully get last price for FIL in USD', async () => {
            let price = await fxRatesAggregator.getLastUSDPrice(1, {from: bob});
            await equal(price.toString(), '15804000000');
        });

        it('Try to get later round price, expect revert', async () => {
            await expectRevert(
                fxRatesAggregator.getHistoricalUSDPrice(1, 2, {from: bob}), 
                "Round not completed yet"
            );
        });
    });

    describe('Test getLastUSDPrice and getHistoricalPrice for BTC', async () => {
        it('Succesfully get last price for BTC in USD', async () => {
            let price = await fxRatesAggregator.getLastUSDPrice(3, {from: bob});
            await equal(price.toString(), '5612587723563');
        });

        it('Try to get later round price, expect revert', async () => {
            await expectRevert(
                fxRatesAggregator.getHistoricalUSDPrice(3, 2, {from: bob}), 
                "Round not completed yet"
            );
        });
    });

    describe('Test getLastETHPrice and getHistoricalPrice for BTC in ETH', async () => {
        it('Succesfully get last price for BTC in ETH', async () => {
            await btcToETHPriceFeed.updateAnswer(web3.utils.toBN(23889912590000000000), {from: owner});

            let price = await fxRatesAggregator.getLastETHPrice(3, {from: bob});
            await equal(price.toString(), '23889912590000000000');
        });

        it('Try to get later round price, expect revert', async () => {
            await expectRevert(
                fxRatesAggregator.getHistoricalETHPrice(3, 3, {from: bob}), 
                "Round not completed yet"
            );
        });
    });

    describe('Test getLastETHPrice and getHistoricalPrice for FIL in ETH', async () => {
        it('Succesfully get last price for FIL in ETH', async () => {
            await filToETHPriceFeed.updateAnswer(web3.utils.toBN(67175250000000000), {from: owner});
            
            let price = await fxRatesAggregator.getLastETHPrice(1, {from: bob});
            await equal(price.toString(), '67175250000000000');
        });

        it('Try to get later round price, expect revert', async () => {
            await expectRevert(
                fxRatesAggregator.getHistoricalETHPrice(1, 3, {from: bob}), 
                "Round not completed yet"
            );
        });
    });

    describe('Test convertion from FIL to ETH', async () => {
        it('Successfully convert 10,000 for FIL in ETH', async () => {            
            let filInETH = await fxRatesAggregator.convertToETH(1, web3.utils.toBN("10000000000000000000000"), {from: bob});
            await equal(filInETH.toString(), '671752500000000000000');
        });

        it('Successfully convert 10 for FIL in ETH', async () => {
            let filInETH = await fxRatesAggregator.convertToETH(1, web3.utils.toBN("10000000000000000000"), {from: bob});
            await equal(filInETH.toString(), '671752500000000000');
        });

        it('Successfully convert 250 for FIL in ETH', async () => {
            let filInETH = await fxRatesAggregator.convertToETH(1, web3.utils.toBN("250000000000000000000"), {from: bob});
            await equal(filInETH.toString(), '16793812500000000000');
        });
    });

    describe('Test convertion from BTC to ETH', async () => {
        it('Successfully convert 1 BTC in ETH', async () => {            
            let filInETH = await fxRatesAggregator.convertToETH(3, web3.utils.toBN("1000000000000000000"), {from: bob});
            await equal(filInETH.toString(), '23889912590000000000');
        });

        it('Successfully convert 10 BTC in ETH', async () => {
            let filInETH = await fxRatesAggregator.convertToETH(3, web3.utils.toBN("10000000000000000000"), {from: bob});
            await equal(filInETH.toString(), '238899125900000000000');
        });

        it('Successfully convert 424.13421341 BTC in ETH', async () => {
            let filInETH = await fxRatesAggregator.convertToETH(3, web3.utils.toBN("424134213410000000000"), {from: bob});
            await equal(filInETH.toString(), '10132529284793305831900');
        });

        it('Successfully convert 0.00000341 BTC in ETH', async () => {
            let filInETH = await fxRatesAggregator.convertToETH(3, web3.utils.toBN("3410000000000"), {from: bob});
            await equal(filInETH.toString(), '81464601931900');
        });
    });
});