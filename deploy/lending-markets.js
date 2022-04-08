const { hexFILString } = require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ getNamedAccounts, deployments }) {
  let lendingMarkets = [];
  const baseRate = 500;
  const baseAmount = 100000;
  const { deployer } = await getNamedAccounts();

  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const collateralContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );

  const loanV2 = await deployments.get('LoanV2');
  const loanV2Contract = await ethers.getContractAt('LoanV2', loanV2.address);

  const lendingController = await deployments.get('LendingMarketController');
  const lendingControllerController = await ethers.getContractAt(
    'LendingMarketController',
    lendingController.address,
  );

  const lendingMarket = await ethers.getContractAt(
    'LendingMarket',
    '0x1723CA6fB3f9Bcd48c5aBBd8d393CE58aAa0c8F3',
  );
  await (await lendingMarket.order(0, 107500, 750)).wait();
  await (await lendingMarket.order(1, 108500, 800)).wait();

  for (i = 0; i < sortedTermDays.length; i++) {
    const tx = await lendingControllerController.deployLendingMarket(
      hexFILString,
      sortedTermDays[i],
    );
    const receipt = await tx.wait();
    console.log(
      'Deployed FIL lending market with ' +
        sortedTermDays[i] +
        ' days term at ' +
        receipt.events[0].args.marketAddr,
    );
    lendingMarkets.push(receipt.events[0].args.marketAddr);

    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      receipt.events[0].args.marketAddr,
    );
    await (
      await lendingMarket.setCollateral(collateralAggregator.address, {
        from: deployer,
      })
    ).wait();
    await (
      await lendingMarket.setLoan(loanV2.address, { from: deployer })
    ).wait();
    await (
      await collateralContract.addCollateralUser(lendingMarket.address, {
        from: deployer,
      })
    ).wait();
    await (
      await loanV2Contract.addLendingMarket(
        hexFILString,
        sortedTermDays[i],
        lendingMarket.address,
      )
    ).wait();

    const borrowRate = baseRate + 50 * i;
    const borrowAmount = baseAmount + 1500 * i;
    const lendRate = borrowRate + 50;
    const lendAmount = borrowAmount + 1000;
    console.log(borrowRate);
    console.log(borrowAmount);
    console.log(lendRate);
    console.log(lendAmount);

    await (await lendingMarket.order(0, borrowAmount, borrowRate)).wait();
    await (await lendingMarket.order(1, lendAmount, lendRate)).wait();
  }
};

module.exports.tags = ['LendingMarkets'];
module.exports.dependencies = ['LoanProduct'];
