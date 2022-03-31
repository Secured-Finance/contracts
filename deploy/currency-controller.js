const { filToETHRate, ethToUSDRate, btcToETHRate } = require('../test-utils').numbers;
const { hexFILString, hexBTCString, hexETHString } = require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const currencyController = await deploy("CurrencyController", {
        from: deployer,
    });
    const currencyControllerContract = await ethers.getContractAt("CurrencyController", currencyController.address);

    const filToETHPriceFeed = await deploy("MockV3Aggregator", {
        from: deployer,
        args: [18, hexFILString, filToETHRate.toString()]
    });

    const ethToUSDPriceFeed = await deploy("MockV3Aggregator", {
        from: deployer,
        args: [18, hexETHString, ethToUSDRate.toString()]
    });

    const btcToETHPriceFeed = await deploy("MockV3Aggregator", {
        from: deployer,
        args: [18, hexBTCString, btcToETHRate.toString()]
    });

    await currencyControllerContract.supportCurrency(
        hexETHString,
        'Ethereum',
        60,
        ethToUSDPriceFeed.address,
        7500,
    );

    await currencyControllerContract.supportCurrency(
        hexFILString,
        'Filecoin',
        461,
        filToETHPriceFeed.address,
        7500,
    );

    await currencyControllerContract.supportCurrency(
        hexBTCString,
        'Bitcoin',
        0,
        btcToETHPriceFeed.address,
        7500,
    );

    await currencyControllerContract.updateCollateralSupport(hexETHString, true);
    await currencyControllerContract.updateMinMargin(hexETHString, 2500);

}

module.exports.tags = ["CurrencyController"]
