const { hexETHString } = require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const wETHToken = await deploy("WETH9Mock", { from: deployer });

    const currencyController = await deployments.get("CurrencyController")
    const collateralAggregator = await deployments.get("CollateralAggregatorV2")
    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address);

    const CollateralVault = await ethers.getContractFactory('CollateralVault');

    const ethVault = await CollateralVault.deploy(
      hexETHString,
      wETHToken.address,
      collateralAggregator.address,
      currencyController.address,
      wETHToken.address,
    );
    await collateralContract.linkCollateralVault(ethVault.address);

}

module.exports.tags = ["CollateralVaults"]
module.exports.dependencies = ["CollateralAggregator"]