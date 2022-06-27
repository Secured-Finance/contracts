const { loanPrefix, hexFILString, toBytes32 } =
  require('../test-utils').strings;
const { sortedTermDays } = require('../test-utils').terms;

module.exports = async function ({ deployments }) {
  // TODO: Move this step to the test script on the forked chain
  // const baseRate = 500;
  // const baseAmount = 100000;

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  // Get contracts from proxyController
  const loan = await proxyController
    .getProductAddress(loanPrefix)
    .then((address) => ethers.getContractAt('LoanV2', address));

  const collateralAggregator = await proxyController
    .getAddress(toBytes32('CollateralAggregator'))
    .then((address) => ethers.getContractAt('CollateralAggregatorV2', address));

  const lendingMarketController = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  for (i = 0; i < sortedTermDays.length; i++) {
    const market = await lendingMarketController.getLendingMarket(
      hexFILString,
      sortedTermDays[i],
    );

    if (market !== ethers.constants.AddressZero) {
      console.log(
        'Skipped deploying FIL lending market of',
        sortedTermDays[i],
        'days term',
      );
      continue;
    }

    const tx = await lendingMarketController.deployLendingMarket(
      hexFILString,
      sortedTermDays[i],
    );
    const receipt = await tx.wait();
    const { marketAddr } = receipt.events.find(
      ({ event }) => event === 'LendingMarketCreated',
    ).args;
    console.log(
      'Deployed FIL lending market with',
      sortedTermDays[i],
      'days term at',
      marketAddr,
    );

    const lendingMarketContract = await ethers.getContractAt(
      'LendingMarket',
      marketAddr,
    );

    await loan
      .addLendingMarket(
        hexFILString,
        sortedTermDays[i],
        lendingMarketContract.address,
      )
      .then((tx) => tx.wait());

    await collateralAggregator
      .addCollateralUser(lendingMarketContract.address)
      .then((tx) => tx.wait());

    // TODO: Move this step to the test script on the forked chain
    // const borrowRate = baseRate + 50 * i;
    // const borrowAmount = baseAmount + 1500 * i;
    // const lendRate = borrowRate + 50;
    // const lendAmount = borrowAmount + 1000;
    // console.log('BorrowRate:', borrowRate);
    // console.log('BorrowAmount', borrowAmount);
    // console.log('LendRate:', lendRate);
    // console.log('LendRate:', lendAmount);

    // await lendingMarketContract
    //   .order(0, borrowAmount, borrowRate)
    //   .then((tx) => tx.wait());

    // await lendingMarketContract
    //   .order(1, lendAmount, lendRate)
    //   .then((tx) => tx.wait());
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
