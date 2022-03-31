module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const productResolver = await deployments.get("ProductAddressResolver")
    const collateralAggregator = await deployments.get("CollateralAggregatorV2")
    const currencyController = await deployments.get("CurrencyController")
    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address);

    const liquidations = await deploy("Liquidations", {
        from: deployer,
        args: [deployer, 10]
    });
    const liquidationsContract = await ethers.getContractAt("Liquidations", liquidations.address);

    await liquidationsContract.setCollateralAggregator(collateralAggregator.address, { from: deployer });
    await liquidationsContract.setProductAddressResolver(productResolver.address, { from: deployer });
    await liquidationsContract.setCurrencyController(currencyController.address, { from: deployer });
    await collateralContract.setLiquidationEngine(liquidations.address);

}

module.exports.tags = ["Liquidations"]
module.exports.dependencies = ["ProductAddressResolver", "CollateralAggregator", "CurrencyController"]