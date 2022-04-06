const { hexETHString } = require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const wETHToken = await deploy("WETH9Mock", { from: deployer });
    console.log('Deployed wETHToken at ' + wETHToken.address);

    const currencyController = await deployments.get("CurrencyController")
    const collateralAggregator = await deployments.get("CollateralAggregatorV2")
    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address);

    const ethVault = await deploy("CollateralVault", {
      from: deployer,
      args: [
        hexETHString,
        wETHToken.address,
        collateralAggregator.address,
        currencyController.address,
        wETHToken.address,  
      ]
    });
    console.log('Deployed ETH CollateralVault at ' + ethVault.address);

    await (await collateralContract.linkCollateralVault(ethVault.address)).wait();
}

module.exports.tags = ["CollateralVaults"]
module.exports.dependencies = ["CollateralAggregator"]