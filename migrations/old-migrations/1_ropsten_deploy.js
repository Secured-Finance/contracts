const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const Loan = artifacts.require('Loan');
const {Side, Ccy, CcyPair, Term} = require('../test-utils').constants;
const effectiveSec = 60 * 60 * 24 * 14; // 14 days

 module.exports = async function (deployer, accounts, network) {
    let lendingMarkets = []
    await deployer.deploy(LendingMarketController)
    const lendingController = await LendingMarketController.deployed()

    await deployer.deploy(FXMarket)
    const fxMarket = await FXMarket.deployed()

    await deployer.deploy(Loan)
    const loan = await Loan.deployed()

    await deployer.deploy(Collateral, loan.address)
    const collateral = await Collateral.deployed()

    await collateral.setFxMarketAddr(fxMarket.address);
    await loan.setLendingControllerAddr(lendingController.address);
    await loan.setCollateralAddr(collateral.address);

    // console.log(lendingMarket.address)
    console.log('lending controller addr is', lendingController.address);
    console.log('fxMarket    addr is', fxMarket.address);
    console.log('collateral  addr is', collateral.address);
    console.log('loan        addr is', loan.address);

    let filAddr = web3.utils.asciiToHex('cid_FIL_0')
    await collateral.setColBook("did:sample_0", filAddr, '0x0', { value: 100000 })

    await fxMarket.setFXBook(
        CcyPair.FILETH,
        [Ccy.ETH, Ccy.FIL, 8500, 100000],
        [Ccy.FIL, Ccy.ETH, 100000, 8000],
        36000,
    );

    await fxMarket.setFXBook(
        CcyPair.FILUSDC,
        [Ccy.FIL, Ccy.USDC, 100000, 5000000],
        [Ccy.USDC, Ccy.FIL, 3000000, 100000],
        36000,
    );

    await fxMarket.setFXBook(
        CcyPair.ETHUSDC,
        [Ccy.USDC, Ccy.ETH, 5000000, 10000],
        [Ccy.ETH, Ccy.USDC, 10000, 3000000],
        36000,
    );

    for (i=0; i < 6; i++) {
        let market = await lendingController.deployLendingMarket(Ccy.FIL, i)
        lendingMarkets.push(market.logs[0].args.marketAddr);

        let lendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr)
        await lendingMarket.setCollateral(collateral.address)
        await lendingMarket.setLoan(loan.address)

        await collateral.addLendingMarket(Ccy.FIL, i, lendingMarket.address)
        await loan.addLendingMarket(Ccy.FIL, i, lendingMarket.address)
        console.log("Lending Market CCY: Ccy.FIL")
        console.log("Lending Market Term: " + i)
        console.log("Lending Market Address: " + lendingMarket.address)
        console.log()
    }

    let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
    await _3mMarket.order(0, 10000, 900, effectiveSec);
    await _3mMarket.order(1, 10000, 700, effectiveSec);
    await _3mMarket.order(0, 20000, 910, effectiveSec);
    await _3mMarket.order(1, 20000, 690, effectiveSec);
    await _3mMarket.order(0, 30000, 920, effectiveSec);
    await _3mMarket.order(1, 30000, 680, effectiveSec);

    let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
    await _6mMarket.order(0, 11000, 1000, effectiveSec);
    await _6mMarket.order(1, 11000, 800, effectiveSec);
    await _6mMarket.order(0, 21000, 1010, effectiveSec);
    await _6mMarket.order(1, 21000, 790, effectiveSec);
    await _6mMarket.order(0, 31000, 1020, effectiveSec);
    await _6mMarket.order(1, 31000, 780, effectiveSec);

    let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
    await _1yMarket.order(0, 12000, 1100, effectiveSec);
    await _1yMarket.order(1, 12000, 900, effectiveSec);
    await _1yMarket.order(0, 22000, 1110, effectiveSec);
    await _1yMarket.order(1, 22000, 890, effectiveSec);
    await _1yMarket.order(0, 32000, 1120, effectiveSec);
    await _1yMarket.order(1, 32000, 880, effectiveSec);

    let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
    await _2yMarket.order(0, 13000, 1200, effectiveSec);
    await _2yMarket.order(1, 13000, 1000, effectiveSec);
    await _2yMarket.order(0, 23000, 1210, effectiveSec);
    await _2yMarket.order(1, 23000, 990, effectiveSec);
    await _2yMarket.order(0, 33000, 1220, effectiveSec);
    await _2yMarket.order(1, 33000, 980, effectiveSec);

    let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
    await _3yMarket.order(0, 14000, 1300, effectiveSec);
    await _3yMarket.order(1, 14000, 1100, effectiveSec);
    await _3yMarket.order(0, 24000, 1310, effectiveSec);
    await _3yMarket.order(1, 24000, 1090, effectiveSec);
    await _3yMarket.order(0, 34000, 1320, effectiveSec);
    await _3yMarket.order(1, 34000, 1080, effectiveSec);

    let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
    await _5yMarket.order(0, 15000, 1500, effectiveSec);
    await _5yMarket.order(1, 15000, 1300, effectiveSec);
    await _5yMarket.order(0, 25000, 1510, effectiveSec);
    await _5yMarket.order(1, 25000, 1290, effectiveSec);
    await _5yMarket.order(0, 35000, 1520, effectiveSec);
    await _5yMarket.order(1, 35000, 1280, effectiveSec);

 }