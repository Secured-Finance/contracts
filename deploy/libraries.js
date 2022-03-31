module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const dealIdLibrary = await deploy("DealId", {
        from: deployer
    });
    const quickSortLibrary = await deploy("QuickSort", {
        from: deployer,
    });
    const discountFactorLibrary = await deploy("DiscountFactor", {
        from: deployer,
    });

}

module.exports.tags = ["Libraries"]