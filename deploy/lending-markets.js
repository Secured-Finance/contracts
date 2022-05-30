const { hexFILString } = require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ deployments }) {
  let lendingMarkets = [];
  const baseRate = 500;
  const baseAmount = 100000;

  const loanV2 = await deployments.get('LoanV2');
  const loanV2Contract = await ethers.getContractAt('LoanV2', loanV2.address);

  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const collateralAggregatorContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );
  const lendingMarketController = await deployments.get(
    'LendingMarketController',
  );
  const lendingMarketControllerContract = await ethers.getContractAt(
    'LendingMarketController',
    lendingMarketController.address,
  );

  for (i = 0; i < sortedTermDays.length; i++) {
    const tx = await lendingMarketControllerContract.deployLendingMarket(
      hexFILString,
      sortedTermDays[i],
    );
    const receipt = await tx.wait();
    const { marketAddr } = receipt.events.find(
      ({ event }) => event === 'LendingMarketCreated',
    ).args;
    console.log(
      'Deployed FIL lending market with ' +
        sortedTermDays[i] +
        ' days term at ' +
        marketAddr,
    );

    lendingMarkets.push(marketAddr);

    const lendingMarketContract = await ethers.getContractAt(
      'LendingMarket',
      marketAddr,
    );
    await (
      await loanV2Contract.addLendingMarket(
        hexFILString,
        sortedTermDays[i],
        lendingMarketContract.address,
      )
    ).wait();
    await (
      await collateralAggregatorContract.addCollateralUser(
        lendingMarketContract.address,
      )
    ).wait();

    const borrowRate = baseRate + 50 * i;
    const borrowAmount = baseAmount + 1500 * i;
    const lendRate = borrowRate + 50;
    const lendAmount = borrowAmount + 1000;
    console.log('BorrowRate:', borrowRate);
    console.log('BorrowAmount', borrowAmount);
    console.log('LendRate:', lendRate);
    console.log('LendRate:', lendAmount);

    await (
      await lendingMarketContract.order(0, borrowAmount, borrowRate)
    ).wait();
    await (await lendingMarketContract.order(1, lendAmount, lendRate)).wait();
  }
};

module.exports.tags = ['LendingMarkets'];
module.exports.dependencies = [
  'AddressResolver',
  'CollateralAggregator',
  'LendingMarketController',
  'Loan',
  'Migration',
];
