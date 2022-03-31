const { hexFILString, hexBTCString, hexETHString } = require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const collateralAggregator = await deployments.get("CollateralAggregatorV2")
    const collateralContract = await ethers.getContractAt("CollateralAggregatorV2", collateralAggregator.address);

    const loanV2 = await deployments.get("LoanV2")
    const loanV2Contract = await ethers.getContractAt("LoanV2", loanV2.address);

    const lendingController = await deployments.get("LendingMarketController")
    const lendingControllerController = await ethers.getContractAt("LendingMarketController", lendingController.address);

    for (i = 0; i < sortedTermDays.length; i++) {
        const tx = await lendingControllerController.deployLendingMarket(
            hexFILString,
            sortedTermDays[i],
        );
        const receipt = await tx.wait();

        const lendingMarket = await ethers.getContractAt("LendingMarket", receipt.events[0].args.marketAddr);

        await lendingMarket.setCollateral(collateralAggregator.address, { from: deployer });
        await lendingMarket.setLoan(loanV2.address, { from: deployer });
        await collateralContract.addCollateralUser(lendingMarket.address, { from: deployer });
        await loanV2Contract.addLendingMarket(
            hexFILString,
            sortedTermDays[i],
            lendingMarket.address,
        );
    }

}

module.exports.tags = ["LendingMarkets"]
module.exports.dependencies = ["LoanProduct"]