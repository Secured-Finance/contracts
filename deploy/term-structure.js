module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const currencyController = await deployments.get("CurrencyController")
    const productResolver = await deployments.get("ProductAddressResolver")
    const quickSortLibrary = await deployments.get("QuickSort")

    const termStructure = await deploy("TermStructure", {
        from: deployer,
        args: [currencyController.address, productResolver.address],
        libraries: {
            QuickSort: quickSortLibrary.address
        }
    });
    console.log('Deployed TermStructure at ' + termStructure.address);
}

module.exports.tags = ["TermStructure"]
module.exports.dependencies = ["Libraries", "CurrencyController", "ProductAddressResolver"]