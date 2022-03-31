module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const productResolver = await deployments.get("ProductAddressResolver")

    const markToMarket = await deploy("MarkToMarket", {
        from: deployer,
        args: [productResolver.address],
    });

}

module.exports.tags = ["MarkToMarket"]
module.exports.dependencies = ["ProductAddressResolver"]