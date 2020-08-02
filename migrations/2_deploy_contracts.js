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
    const collateral = await deployer.deploy(
      Collateral,
      moneyMarket.address,
      fxMarket.address,
    );

    console.log('moneyMarket addr is', moneyMarket.address);
    console.log('fxMarket addr is', fxMarket.address);
    console.log('collateral addr is', collateral.address);

    // Init MoneyMarket with sample data
      let input = sample.MoneyMarket;
      await moneyMarket.setLoanBook(
        input.ccy,
        input.lenders,
        input.borrowers,
        input.effectiveSec,
      );

      // Init FXMarket with sample data
      input = sample.FXMarket;
      await fxMarket.setFXBook(
        input.pair,
        input.offerInput,
        input.bidInput,
        input.effectiveSec,
      );

      // Init Collateral with sample data
      // await collateral.setMarketAddr(moneyMarket.address, fxMarket.address);
      input = sample.Collateral;
      await collateral.setColBook(input[0].id, input[0].addrFIL, {
        from: accounts[0],
      });
      await collateral.setColBook(input[1].id, input[1].addrFIL, {
        from: accounts[1],
      });
      await collateral.setColBook(input[2].id, input[2].addrFIL, {
        from: accounts[2],
      });
      await collateral.registerFILCustodyAddr('cid_custody_FIL_0', accounts[0]);
      await collateral.registerFILCustodyAddr('cid_custody_FIL_1', accounts[1]);
      await collateral.registerFILCustodyAddr('cid_custody_FIL_2', accounts[2]);
  });
};

const sample = {
  MoneyMarket: {
    ccy: 1,
    lenders: [
      // [term, size, rate] (1% = 100bps)
      [0, 100000, 500], // [_3m, 100000FIL, 500bps is 5%]
      [1, 110000, 600], // [_6m, 110000FIL, 600bps is 6%]
      [2, 120000, 900],
      [3, 130000, 1200],
      [4, 140000, 1500],
      [5, 150000, 1800], // [_5y, 150000FIL, 1800bps is 18%]
    ],
    borrowers: [
      [0, 100000, 400], // [_3m, 100000FIL, 400bps is 4%]
      [1, 110000, 500], // [_6m, 110000FIL, 500bps is 5%]
      [2, 120000, 800],
      [3, 130000, 1000],
      [4, 140000, 1300],
      [5, 150000, 1600], // [_5y, 150000FIL, 1600bps is 16%]
    ],
    effectiveSec: 36000, // 10 hrs
  },
  FXMarket: {
    pair: 0, // FILETH
    // [ccyBuy, ccySell, amtBuy, amtSell] 8500 / 100000 = 0.085
    offerInput: [0, 1, 8500, 100000], // [ETH, FIL, 8500ETH, 100000FIL]
    bidInput: [1, 0, 100000, 8000], // [FIL, ETH, 100000FIL, 8000ETH]
    effectiveSec: 36000,
  },
  Collateral: [
    {
      id: 'did:sample_0',
      addrFIL: 'cid_FIL_0',
    },
    {
      id: 'did:sample_1',
      addrFIL: 'cid_FIL_1',
    },
    {
      id: 'did:sample_2',
      addrFIL: 'cid_FIL_2',
    },
  ],
};
