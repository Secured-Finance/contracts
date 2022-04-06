module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const dealIdLibrary = await deploy("DealId", {
        from: deployer
    });
    console.log('Deployed DealId at ' + dealIdLibrary.address);

    const quickSortLibrary = await deploy("QuickSort", {
        from: deployer,
    });
    console.log('Deployed QuickSort at ' + quickSortLibrary.address);

    const discountFactorLibrary = await deploy("DiscountFactor", {
        from: deployer,
    });
    console.log('Deployed DiscountFactor at ' + discountFactorLibrary.address);

}

module.exports.tags = ["Libraries"]