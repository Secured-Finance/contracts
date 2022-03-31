module.exports = async function ({ getNamedAccounts, deployments }) {
    const collateralAggregator = await deployments.get("CollateralAggregatorV2")
    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address)

    const crosschainResolverFactory = await ethers.getContractFactory('CrosschainAddressResolver')
    const crosschainResolver = await crosschainResolverFactory.deploy(collateralAggregator.address)
    await crosschainResolver.deployed()

    await collateralContract.setCrosschainAddressResolver(crosschainResolver.address)
}

module.exports.tags = ["CrossChainAddressResolver"]
module.exports.dependencies = ["CollateralAggregator"]