const MoneyMarket = artifacts.require('MoneyMarket');
const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');

/* DEFAULT */
// module.exports = function(deployer) {
//   deployer.deploy(MoneyMarket);
//   deployer.deploy(FXMarket);
//   deployer.deploy(Collateral);
// };

/* DEBUG */
// 1) truffle compile
// 2) truffle develop
// 3) migrate --reset
module.exports = function (deployer, network, accounts) {
  deployer.then(async () => {
    const moneyMarket = await deployer.deploy(MoneyMarket);
    const fxMarket = await deployer.deploy(FXMarket);
    const collateral = await deployer.deploy(Collateral);

    let input = sample.MoneyMarket;
    await moneyMarket.setLoanBook(
      input.ccy,
      input.lenders,
      input.borrowers,
      input.effectiveSec,
    );
    let makers = await moneyMarket.getMarketMakers();
    console.log('makers is', makers);
    let curv = await moneyMarket.getMidRates();
    console.log('curv is', curv);
  });
};

const sample = {

  MoneyMarket: {
    ccy: 1,
    lenders: [
      [0, 100, 10],
      [1, 111, 11],
      [2, 222, 22],
      [3, 333, 33],
      [4, 444, 44],
      [5, 555, 55],
    ],
    borrowers: [
      [0, 100, 5],
      [1, 111, 6],
      [2, 222, 20],
      [3, 333, 30],
      [4, 444, 40],
      [5, 555, 50],
    ],
    effectiveSec: 36000,
  },
  FXMarket: {
    pair: 0,
    offerInput: [1, 0, 100000, 8500],
    bidInput: [1, 0, 100000, 8000],
    effectiveSec: 3600,
  },
};
