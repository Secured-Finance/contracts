module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const currencyController = await deployments.get("CurrencyController")

    const collateralAggregator = await deploy("CollateralAggregatorV2", {
        from: deployer,
    });
    console.log('Deployed CollateralAggregatorV2 at ' + collateralAggregator.address);

    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address);
    await (await collateralContract.setCurrencyController(currencyController.address)).wait();
}

module.exports.tags = ["CollateralAggregator"]
module.exports.dependencies = ["CurrencyController", "CrosschainAddressResolver"]