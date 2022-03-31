module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const paymentAggregator = await deploy("PaymentAggregator", {
        from: deployer,
    });

}

module.exports.tags = ["PaymentAggregator"]
