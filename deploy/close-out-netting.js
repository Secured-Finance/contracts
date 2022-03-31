module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const paymentAggregator = await deployments.get("PaymentAggregator")
    const paymentAggregatorContract = await ethers.getContractAt("PaymentAggregator", paymentAggregator.address)

    const closeOutNetting = await deploy("CloseOutNetting", {
        from: deployer,
        args: [paymentAggregator.address]
    })

    await paymentAggregatorContract.setCloseOutNetting(closeOutNetting.address)

}

module.exports.tags = ["CloseOutNetting"]
module.exports.dependencies = ["PaymentAggregator"]