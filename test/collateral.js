const Collateral = artifacts.require('Collateral');
const Loan = artifacts.require('Loan');
const LendingMarketController = artifacts.require('LendingMarketController');
const FXRatesAggregator = artifacts.require('FXRatesAggregator');
const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { emitted, reverted, equal } = require('../test-utils').assert;
const {Ccy, Term} = require('../test-utils').constants;
const { should } = require('chai');
should();

const effectiveSec = 60 * 60 * 24 * 14; // 14 days
const expectRevert = reverted;

contract('Collateral', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let collateral;
    let ratesAggregator;
    let loan;
    let lendingController;
    let lendingMarket;

    let filToETHPriceFeed;
    let btcToETHPriceFeed;
    let usdcToETHPriceFeed;

    let additionalLendingMarkets = [];
    let btcLendingMarkets = [];
    let usdcLendingMarkets = [];

    const filAliceAddr = web3.utils.utf8ToHex("f0152353");
    const btcAliceAddr = web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmK1");

    before('deploy Collateral, Loan, LendingMarket smart contracts', async () => {
        loan = await Loan.new();

        collateral = await Collateral.new(loan.address);
        
        ratesAggregator = await FXRatesAggregator.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.FIL, web3.utils.toBN("67175250000000000"));
        setPriceFeedTx = await ratesAggregator.linkPriceFeed(Ccy.FIL, filToETHPriceFeed.address, true);
        await emitted(setPriceFeedTx, 'PriceFeedAdded');

        await collateral.setRatesAggregatorAddr(ratesAggregator.address, {from: owner});
        await loan.setCollateralAddr(collateral.address, {from: owner});

        lendingController = await LendingMarketController.new();

        let _1yMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._1y);
        await emitted(_1yMarket, "LendingMarketCreated");
        lendingMarket = await LendingMarket.at(_1yMarket.logs[0].args.marketAddr);

        await lendingMarket.setCollateral(collateral.address, {from: owner});
        await lendingMarket.setLoan(loan.address, {from: owner});
        await collateral.addLendingMarket(Ccy.FIL, Term._1y, lendingMarket.address, {from: owner});
        await loan.addLendingMarket(Ccy.FIL, Term._1y, lendingMarket.address, {from: owner});        
    });

    describe('Test functions with onlyOwner modifier', async () => {
        it('Try to link LendingMarket by Bob, expect revert', async () => {
            await expectRevert(
                collateral.addLendingMarket(Ccy.FIL, Term._3m, "0x0000000000000000000000000000000000000000", {from: bob}), ""
            );
        });

        it('Try to link existing LendingMarket by Owner, expect revert', async () => {
            await expectRevert(
                collateral.addLendingMarket(Ccy.FIL, Term._1y, lendingMarket.address, {from: owner}), "Couldn't rewrite existing market"
            );
        });

        it('Try to link existing Loan by Bob, expect revert', async () => {
            await expectRevert(
                collateral.setLoanAddr(loan.address, {from: bob}), ""
            );
        });

        it('Try to set existing Loan by Owner, expect revert', async () => {
            await expectRevert(
                collateral.setLoanAddr(loan.address, {from: owner}), "Couldn't rewrite the same address"
            );
        });

        it('Try to set FXRatesAggregator by Bob, expect revert', async () => {
            await expectRevert(
                collateral.setRatesAggregatorAddr(loan.address, {from: bob}), ""
            );
        });

        it('Try to set FXRatesAggregator with zero address by Owner, expect revert', async () => {
            await expectRevert(
                collateral.setRatesAggregatorAddr('0x0000000000000000000000000000000000000000', {from: owner}), ""
            );
        });
    });

    describe("Add additional LendingMarket contracts", async () => {
        it('Add 3 month FIL LendingMarket', async () => {
            let _3mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._3m);
            await emitted(_3mMarket, "LendingMarketCreated");

            additionalLendingMarkets.push(_3mMarket.logs[0].args.marketAddr);
            let market = await LendingMarket.at(_3mMarket.logs[0].args.marketAddr);
            
            await market.setCollateral(collateral.address, {from: owner});
            await market.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._3m, market.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._3m, market.address, {from: owner});        
        });

        it('Add 6 month FIL LendingMarket', async () => {
            _6mMarket = await lendingController.deployLendingMarket(Ccy.FIL, Term._6m);
            await emitted(_6mMarket, "LendingMarketCreated");
            additionalLendingMarkets.push(_6mMarket.logs[0].args.marketAddr);
            let market = await LendingMarket.at(_6mMarket.logs[0].args.marketAddr);
            
            await market.setCollateral(collateral.address, {from: owner});
            await market.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.FIL, Term._6m, market.address, {from: owner});
            await loan.addLendingMarket(Ccy.FIL, Term._6m, market.address, {from: owner});        
        });

        it('Check if 3 month FIL LendingMarket linked correctly', async() => {
            let result = await collateral.isLendingMarket(Ccy.FIL, additionalLendingMarkets[0]);
            result.should.be.equal(true);
        });

        it('Check if 6 month FIL LendingMarket linked correctly', async() => {
            let result = await collateral.isLendingMarket(Ccy.FIL, additionalLendingMarkets[1]);
            result.should.be.equal(true);
        });

        it('Check if 1 year FIL LendingMarket linked correctly', async() => {
            let result = await collateral.isLendingMarket(Ccy.FIL, lendingMarket.address);
            result.should.be.equal(true);
        });

        it('Expect revery on checking incorrect FIL LendingMarket', async() => {
            let result = await collateral.isLendingMarket(Ccy.FIL, "0x0000000000000000000000000000000000000001");
            result.should.be.equal(false);
        });
    });

    describe("Register collateral book for Alice", async () => {
        it('Register collateral book without payment', async () => {
            let result = await collateral.register("Alice", "f0152351", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4", {from: alice});
            await emitted(result, 'Register');
        });

        it('Revert on second register collateral book', async () => {
            await expectRevert(
                collateral.register("Alice", "f0152351", "3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4", {from: alice}), 
                "User registered already"
            );
        });

        it('Get Alice collateral book and check values', async () => {
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(web3.utils.utf8ToHex("f0152351"));
            book[2].should.be.equal(web3.utils.utf8ToHex("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmY4"));
            book[3].should.be.equal('0');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('0');
        });

        it('Successfully update FIL address in collateral book', async () => {
            let result = await collateral.updateFILAddr("f0152353", {from: alice});
            await emitted(result, 'UpdateFILAddress');
        });

        it('Successfully update BTC address in collateral book', async () => {
            let result = await collateral.updateBTCAddr("3LvFB9E2rqjnvHmjUbQqpcc4JbfuXqVmK1", {from: alice});
            await emitted(result, 'UpdateBTCAddress');
        });
        
        it('Get Alice collateral book and double-check updated values', async () => {
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('0');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('0');
        });
    });

    describe("Test Deposit and Withraw collateral by Alice", async () => {
        it('Deposit 10 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let tx = await collateral.deposit({from: alice, value: 10000000000000000000});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');
            
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('10000000000000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("10000000000000000000")).toString());
            });
        });

        it('Deposit 13,5252524 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let tx = await collateral.deposit({from: alice, value: 13525252400000000000});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');
            
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('23525252400000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("13525252400000000000")).toString());
            });
        });

        it('Expect revert on withdraw 30 ETH from Collateral by Alice, ', async () => {            
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("30000000000000000000"), {from: alice}), 
                "Can't withdraw more than collateral"
            );
        });

        it('Successfully withdraw 12.42429429 ETH from Collateral by Alice, ', async () => { 
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
 
            let tx = await collateral.withdraw(web3.utils.toBN("12424294290000000000"), {from: alice});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Withdraw');
            
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('11100958110000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.add(web3.utils.toBN("12424294290000000000")).toString());
            });
        });

        it('Successfully withdraw all left ETH from Collateral by Alice, ', async () => { 
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
 
            let tx = await collateral.withdraw(web3.utils.toBN("11100958110000000000"), {from: alice});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Withdraw');
            
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('0');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.add(web3.utils.toBN("11100958110000000000")).toString());
            });
        });

        it('Expect revert on withdraw 0.0001 ETH from empty collateral book by Alice, ', async () => {            
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("100000000000000"), {from: alice}), 
                "CollateralState should be IN_USE or AVAILABLE"
            );
        });
    });

    describe("Test making new orders on FIL LendingMarket, and check collateral usage", async () => {
        it('Deposit 1 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let tx = await collateral.deposit({from: alice, value: "1000000000000000000"});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');
            
            const book = await collateral.getOneBook(alice);
            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('1000000000000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal('0');
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("1000000000000000000")).toString());
            });
        });

        it('Expect revert on making order for 100 FIL', async () => {
            await expectRevert(
                lendingMarket.order(0, web3.utils.toBN("100000000000000000000"), 700, effectiveSec, {from: alice}), 
                "Not enough collateral"
            );
        });

        it('Successfully make order for 10 FIL', async () => {
            let marketOrder = await lendingMarket.order(0, web3.utils.toBN("10000000000000000000"), 725, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Check Alice collateral book usage', async () => {
            const book = await collateral.getOneBook(alice);
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('1000000000000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal(filUsed.toString());
            book[6].should.be.equal('0');
            book[7].should.be.equal('0');
            book[8].should.be.equal(true);
            book[9].should.be.equal('2');
        });

        it('Calculate all present values in ETH', async () => {
            const pvs = await collateral.calculatePVinETH(alice);
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filInETH = await ratesAggregator.convertToETH(Ccy.FIL, filUsed, {from: alice});

            pvs.toString().should.be.equal(filInETH.toString());
        });

        it('Calculate collateral coverage, expect to be equal with manual calculations', async () => {
            let collateralAmt = web3.utils.toBN("1000000000000000000");
            const coverage = await collateral.getCoverage(alice);
            const pvs = await collateral.calculatePVinETH(alice);
            let manualCoverage = (collateralAmt.mul(web3.utils.toBN(10000))).div(pvs);

            coverage.toNumber().should.be.equal(manualCoverage.toNumber());
        });
    });

    describe("Test making new orders on BTC LendingMarket, and check collateral usage", async () => {
        it('Add 1 year BTC LendingMarket and link with FXRatesAggregator', async () => {
            _1yBTCMarket = await lendingController.deployLendingMarket(Ccy.BTC, Term._1y);
            await emitted(_1yBTCMarket, "LendingMarketCreated");
            btcLendingMarkets.push(_1yBTCMarket.logs[0].args.marketAddr);
            let market = await LendingMarket.at(_1yBTCMarket.logs[0].args.marketAddr);
            
            await market.setCollateral(collateral.address, {from: owner});
            await market.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.BTC, Term._1y, market.address, {from: owner});
            await loan.addLendingMarket(Ccy.BTC, Term._1y, market.address, {from: owner});  

            btcToETHPriceFeed = await MockV3Aggregator.new(18, 3, web3.utils.toBN(23889912590000000000));
            setPriceFeedTx = await ratesAggregator.linkPriceFeed(3, btcToETHPriceFeed.address, true);
            await emitted(setPriceFeedTx, 'PriceFeedAdded');    
        });

        it('Expect revert on making order for 1 BTC', async () => {
            let market = await LendingMarket.at(btcLendingMarkets[0]);
            await expectRevert(
                market.order(0, web3.utils.toBN("1000000000000000000"), 320, effectiveSec, {from: alice}), 
                "Not enough collateral"
            );
        });

        it('Successfully make order for 0.1 BTC', async () => {
            let market = await LendingMarket.at(btcLendingMarkets[0]);
            let marketOrder = await market.order(0, web3.utils.toBN("100000000000000000"), 325, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Check Alice collateral book usage', async () => {
            const book = await collateral.getOneBook(alice);
            let btcUsed = (web3.utils.toBN("100000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('1000000000000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal(filUsed.toString());
            book[6].should.be.equal('0');
            book[7].should.be.equal(btcUsed.toString());
            book[8].should.be.equal(true);
            book[9].should.be.equal('2');
        }); 

        it('Calculate all present values in ETH', async () => {
            const pvs = await collateral.calculatePVinETH(alice);
            let btcUsed = (web3.utils.toBN("100000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filInETH = await ratesAggregator.convertToETH(Ccy.FIL, filUsed, {from: alice});
            let btcInETH = await ratesAggregator.convertToETH(Ccy.BTC, btcUsed, {from: alice});
            let pvInETH = filInETH.add(btcInETH);

            pvs.toString().should.be.equal(pvInETH.toString());
        });

        it('Calculate collateral coverage, expect to be equal with manual calculations', async () => {
            let collateralAmt = web3.utils.toBN("1000000000000000000");
            const coverage = await collateral.getCoverage(alice);
            const pvs = await collateral.calculatePVinETH(alice);
            let manualCoverage = (collateralAmt.mul(web3.utils.toBN(10000))).div(pvs);
            coverage.toNumber().should.be.equal(manualCoverage.toNumber());
        });
    });

    describe("Test making new orders on USDC LendingMarket, and check collateral usage", async () => {
        it('Add 1 year USDC LendingMarket and link with FXRatesAggregator', async () => {
            let _1yUSDCMarket = await lendingController.deployLendingMarket(Ccy.USDC, Term._1y);
            await emitted(_1yUSDCMarket, "LendingMarketCreated");
            usdcLendingMarkets.push(_1yUSDCMarket.logs[0].args.marketAddr);
            let market = await LendingMarket.at(_1yUSDCMarket.logs[0].args.marketAddr);
            
            await market.setCollateral(collateral.address, {from: owner});
            await market.setLoan(loan.address, {from: owner});
            await collateral.addLendingMarket(Ccy.USDC, Term._1y, market.address, {from: owner});
            await loan.addLendingMarket(Ccy.USDC, Term._1y, market.address, {from: owner});  

            usdcToETHPriceFeed = await MockV3Aggregator.new(18, 2, web3.utils.toBN("440220000000000"));
            setPriceFeedTx = await ratesAggregator.linkPriceFeed(2, usdcToETHPriceFeed.address, true);
            await emitted(setPriceFeedTx, 'PriceFeedAdded');    
        });

        it('Expect revert on making order for 15,000 USDC', async () => {
            let market = await LendingMarket.at(usdcLendingMarkets[0]);
            await expectRevert(
                market.order(0, web3.utils.toBN("15000000000000000000000"), 170, effectiveSec, {from: alice}), 
                "Not enough collateral"
            );
        });

        it('Successfully make order for 500 USDC', async () => {
            let market = await LendingMarket.at(usdcLendingMarkets[0]);
            let marketOrder = await market.order(0, web3.utils.toBN("500000000000000000000"), 175, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Check Alice collateral book usage', async () => {
            const book = await collateral.getOneBook(alice);
            let btcUsed = (web3.utils.toBN("100000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let usdcUsed = (web3.utils.toBN("500000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal('1000000000000000000');
            book[4].should.be.equal('0');
            book[5].should.be.equal(filUsed.toString());
            book[6].should.be.equal(usdcUsed.toString());
            book[7].should.be.equal(btcUsed.toString());
            book[8].should.be.equal(true);
            book[9].should.be.equal('2');
        }); 

        it('Calculate all present values in ETH', async () => {
            const pvs = await collateral.calculatePVinETH(alice);
            let btcUsed = (web3.utils.toBN("100000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let usdcUsed = (web3.utils.toBN("500000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filInETH = await ratesAggregator.convertToETH(Ccy.FIL, filUsed, {from: alice});
            let btcInETH = await ratesAggregator.convertToETH(Ccy.BTC, btcUsed, {from: alice});
            let usdcInETH = await ratesAggregator.convertToETH(Ccy.USDC, usdcUsed, {from: alice});
            let pvInETH = filInETH.add(btcInETH).add(usdcInETH);

            pvs.toString().should.be.equal(pvInETH.toString());
        });

        it('Calculate collateral coverage, expect to be equal with manual calculations', async () => {
            let collateralAmt = web3.utils.toBN("1000000000000000000");
            const coverage = await collateral.getCoverage(alice);
            const pvs = await collateral.calculatePVinETH(alice);
            let manualCoverage = (collateralAmt.mul(web3.utils.toBN(10000))).div(pvs);
            coverage.toNumber().should.be.equal(manualCoverage.toNumber());
        });
    });

    describe("Try to withdraw collateral by Alice", async () => {
        it('Expect revert on withdraw 0.5 ETH by Alice', async () => {
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("50000000000000000"), {from: alice}), 
                "Can't withdraw more than 150% coverage"
            );
        });

        it('Successfully withdraw collateral by Alice for 150% coverage', async () => {
            let initialCollateral = web3.utils.toBN("1000000000000000000");
            let coverage = await collateral.getCoverage(alice);
            let pvInETH = await collateral.calculatePVinETH(alice);
            let delta = coverage.sub(web3.utils.toBN(15000));
            let deltaInETH = (pvInETH.mul(delta)).div(web3.utils.toBN(10000));

            // let coveredEth = (initialCollateral.mul(web3.utils.toBN(10000))).div(web3.utils.toBN(152));
            // coveredEth.toString().should.be.equal(pvInETH.toString());

            let tx = await collateral.withdraw(deltaInETH, {from: alice});
            let finalCoverage = await collateral.getCoverage(alice);
            finalCoverage.toString().should.be.equal("15000");

            const book = await collateral.getOneBook(alice);
            let btcUsed = (web3.utils.toBN("100000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let usdcUsed = (web3.utils.toBN("500000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal(initialCollateral.sub(deltaInETH).toString());
            book[4].should.be.equal('0');
            book[5].should.be.equal(filUsed.toString());
            book[6].should.be.equal(usdcUsed.toString());
            book[7].should.be.equal(btcUsed.toString());
            book[8].should.be.equal(true);
            book[9].should.be.equal('2');
        });

        it('Expect revert on withdraw 1 Wei by Alice', async () => {
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("1"), {from: alice}), 
                "Can't withdraw more than 150% coverage"
            );
        });

        it('Expect revert on making order for 0.01 FIL', async () => {
            await expectRevert(
                lendingMarket.order(1, web3.utils.toBN("10000000000000000"), 735, effectiveSec, {from: alice}), 
                "Please upsize collateral"
            );
        });
    });

    describe("Test release collateral functions by canceling all lending orders (FIL, USDC, BTC)", async () => {
        it('Successfully cancel order for 500 USDC', async () => {
            let market = await LendingMarket.at(usdcLendingMarkets[0]);
            let tx = await market.cancelOrder(1, {from: alice});
            await emitted(tx, 'CancelOrder');
        });

        it('Expect revert on withdraw all collateral book by Alice, ', async () => {            
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("1000000000000000000"), {from: alice}), 
                "Can't withdraw more than 150% coverage"
            );
        });

        it('Successfully cancel order for 0.1 BTC', async () => {
            let market = await LendingMarket.at(btcLendingMarkets[0]);
            let tx = await market.cancelOrder(1, {from: alice});
            await emitted(tx, 'CancelOrder');
        });

        it('Expect revert on withdraw 1.1 ETH collateral book by Alice, ', async () => {            
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("1100000000000000000"), {from: alice}), 
                "Can't withdraw more than 150% coverage"
            );
        });

        it('Successfully cancel order for 10 FIL', async () => {
            let tx = await lendingMarket.cancelOrder(1, {from: alice});
            await emitted(tx, 'CancelOrder');
        });

        it('Expect revert on withdraw 1.1 ETH collateral book by Alice, ', async () => {            
            await expectRevert(
                collateral.withdraw(web3.utils.toBN("1100000000000000000"), {from: alice}), 
                "Can't withdraw more than collateral"
            );
        });

        it('Check collateral book after canceling order', async () => {
            const book = await collateral.getOneBook(alice);

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal("984317519031980000");
            book[4].should.be.equal('0');
            book[5].should.be.equal("0");
            book[6].should.be.equal('0');
            book[7].should.be.equal("0");
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');
        });
    });

    describe("Test FX Rates changes effects on collateral coverage", async () => {
        it('Deposit collateral to 30 ETH by Alice', async () => {
            const collateralBalance = web3.utils.toBN("984317519031980000");
            let depositSum = web3.utils.toBN("30000000000000000000").sub(collateralBalance);

            let tx = await collateral.deposit({from: alice, value: depositSum});
            await emitted(tx,"Deposit");

            const book = await collateral.getOneBook(alice);

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal("30000000000000000000");
            book[4].should.be.equal('0');
            book[5].should.be.equal("0");
            book[6].should.be.equal('0');
            book[7].should.be.equal("0");
            book[8].should.be.equal(true);
            book[9].should.be.equal('1');
        });

        it('Successfully make order for 1000 FIL', async () => {
            let filUsed = (web3.utils.toBN("1000000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let marketOrder = await lendingMarket.order(0, web3.utils.toBN("1000000000000000000000"), 725, effectiveSec, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            const book = await collateral.getOneBook(alice);

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal("30000000000000000000");
            book[4].should.be.equal('0');
            book[5].should.be.equal(filUsed.toString());
            book[6].should.be.equal('0');
            book[7].should.be.equal("0");
            book[8].should.be.equal(true);
            book[9].should.be.equal('2');
        });

        it('Expect revert on making new order for 500 FIL', async () => {
            await expectRevert(
                lendingMarket.order(0, web3.utils.toBN("500000000000000000000"), 725, effectiveSec, {from: alice}),
                "Please upsize collateral"
            )
        });

        it('Successfully make new order FIL order to match 150% coverage', async () => {
            let balance = web3.utils.toBN("30000000000000000000");
            let filUsed = (web3.utils.toBN("1000000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let usedPVinETH = await ratesAggregator.convertToETH(Ccy.FIL, filUsed);

            let targetEth = (balance.mul(web3.utils.toBN(10000))).div(web3.utils.toBN(15000));
            let deltaEth = targetEth.sub(usedPVinETH);

            let filPrice = await ratesAggregator.getLastETHPrice(Ccy.FIL, {from: alice});
            let filAmt = deltaEth.mul(web3.utils.toBN("1000000000000000000")).div(filPrice);
            let newOrderAmount = filAmt.mul(web3.utils.toBN('5'));

            let tx = await lendingMarket.order(0, newOrderAmount, 725, effectiveSec, {from: alice});
            await emitted(tx, "MakeOrder");

            let finalCoverage = await collateral.getCoverage(alice);
            finalCoverage.toNumber().should.be.equal(15000);
        });

        it('Expect revert on withdraw 1 Wei from Collateral', async () => {
            await expectRevert(
                collateral.withdraw(1, {from: alice}),
                "Can't withdraw more than 150% coverage"
            )
        });

        it('Change FIL fx rate by 10% higher than original rate, expect coverage to go lower 150%', async () => {
            let filPrice = await ratesAggregator.getLastETHPrice(Ccy.FIL, {from: alice});
            let targetRate = filPrice.mul(web3.utils.toBN(110)).div(web3.utils.toBN(100));
            await filToETHPriceFeed.updateAnswer(targetRate, {from: owner});

            let coverage = await collateral.getCoverage(alice);
            coverage.toNumber().should.be.below(15000);
        });

        it('Update Alice collateral book, expect state to be MARGIN_CALL', async () => {
            let tx = await collateral.updateState(alice);
            await emitted(tx,'UpdateState');

            const book = await collateral.getOneBook(alice);

            book[0].should.be.equal('Alice');
            book[1].should.be.equal(filAliceAddr);
            book[2].should.be.equal(btcAliceAddr);
            book[3].should.be.equal("30000000000000000000");
            book[4].should.be.equal('0');
            book[5].should.be.equal("297728702163371182094");
            book[6].should.be.equal('0');
            book[7].should.be.equal("0");
            book[8].should.be.equal(true);
            book[9].should.be.equal('3');
        });

        it('Expect revert on withdraw 1 Wei when collateral state is MARGIN_CALL', async () => {
            await expectRevert(
                collateral.withdraw(1, {from: alice}),
                "CollateralState should be IN_USE or AVAILABLE"
            )
        });
    });

    describe("Test isCovered functions", async () => {
        it('Upsize 10 ETH more to collateral, and check that 1,000 FIL order is not covered enough', async () => {
            let tx = await collateral.deposit({from: alice, value: 10000000000000000000});
            await emitted(tx, 'Deposit');

            let coverage = await collateral.getCoverage(alice);
            coverage.toNumber().should.be.above(15000);
            let filUsed = (web3.utils.toBN("1000000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));

            let isCovered = await collateral.isCovered(filUsed, Ccy.FIL, alice);
            isCovered.should.be.equal(false);
        });
    
        it('Define the amount of FIL would be covered after upsizing collateral', async () => {
            const book = await collateral.getOneBook(alice);
            let balance = web3.utils.toBN(book[3]);
            let filLocked = web3.utils.toBN(book[5]);
            let usedPVinETH = await ratesAggregator.convertToETH(Ccy.FIL, filLocked);

            let targetEth = (balance.mul(web3.utils.toBN(10000))).div(web3.utils.toBN(15000));
            let deltaEth = targetEth.sub(usedPVinETH);

            let filPrice = await ratesAggregator.getLastETHPrice(Ccy.FIL, {from: alice});
            let filAmt = deltaEth.mul(web3.utils.toBN("1000000000000000000")).div(filPrice);

            let isCovered = await collateral.isCovered(filAmt, Ccy.FIL, alice);
            isCovered.should.be.equal(true);
        });

        it('Change FIL fx rate by 0.05% higher than last rate, expect isCovered to return true', async () => {
            let filPrice = await ratesAggregator.getLastETHPrice(Ccy.FIL, {from: alice});
            let targetRate = filPrice.mul(web3.utils.toBN(10003)).div(web3.utils.toBN(10000));
            await filToETHPriceFeed.updateAnswer(targetRate, {from: owner});

            const book = await collateral.getOneBook(alice);
            let balance = web3.utils.toBN(book[3]);
            let filLocked = web3.utils.toBN(book[5]);
            let usedPVinETH = await ratesAggregator.convertToETH(Ccy.FIL, filLocked);

            let targetEth = (balance.mul(web3.utils.toBN(10000))).div(web3.utils.toBN(15000));
            let deltaEth = targetEth.sub(usedPVinETH);

            let filAmt = deltaEth.mul(web3.utils.toBN("1000000000000000000")).div(filPrice);

            let isCovered = await collateral.isCovered(filAmt, Ccy.FIL, alice);
            isCovered.should.be.equal(false);
        });
    });

    // =========== TODO: Test liquidations with loans, after Loan refactoring ===========
});