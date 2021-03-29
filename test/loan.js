const FXMarket = artifacts.require('FXMarket');
const Collateral = artifacts.require('Collateral');
const LendingMarket = artifacts.require('LendingMarket');
const LendingMarketController = artifacts.require('LendingMarketController');
const Loan = artifacts.require('Loan');

const {Side, Ccy, Term, ColState, sample} = require('../test-utils').constants;
const {accounts, defaultSender, web3, provider} = require("@openzeppelin/test-environment");
const {
  toDate,
  printCol,
} = require('../test-utils/src/helper');
const {
  ONE_DAY,
  NOTICE_GAP,
  advanceTimeAndBlock,
  getLatestTimestamp,
} = require('../test-utils').time;
const { emitted, reverted } = require('../test-utils').assert;
const { orders } = require("./orders");

/* Helper */
const val = (obj) => {
    if (obj.addrFIL) obj.addrFIL = web3.utils.asciiToHex(obj.addrFIL);
    return Object.values(obj);
};  

const getDate = async () => {
  const currentTime = await getLatestTimestamp();
  return toDate(currentTime);
};

const effectiveSec = 60 * 60 * 24 * 14; // 14 days

const expectRevert = reverted;

contract('Loan', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const users = [alice, bob, carol]; // without owner

  let fxMarket;
  let collateral;
  let loan;
  let lendingController;
  let lendingMarkets = [];
  let orderList;

    before('deploy contracts', async () => {
        orderList = orders;
        lendingController = await LendingMarketController.new();

        fxMarket = await FXMarket.new();
        loan = await Loan.new();
        collateral = await Collateral.new(loan.address);
        await collateral.setFxMarketAddr(fxMarket.address, {from: owner});
        await loan.setLendingControllerAddr(lendingController.address, {from: owner});
        await loan.setCollateralAddr(collateral.address, {from: owner});
    });

    describe('Setup Test Data', async () => {
        it('Init Collateral with sample data', async () => {
            sample.Collateral.forEach(async (item, index) => {
                let res = await collateral.setColBook(...val(item), {
                from: users[index],
                // value: 0,
                value: 100000,
                });
                await emitted(res, 'SetColBook');
            });
        });
        it('Init with sample FXMarket', async () => {
            sample.FXMarket.forEach(async (item) => {
                let res = await fxMarket.setFXBook(...val(item), {from: alice});
                await emitted(res, 'SetFXBook');
            });
        });
        it('deploy Lending Markets with each Term for FIL market', async () => {
            for (i=0; i < 6; i++) {
                let market = await lendingController.deployLendingMarket(Ccy.FIL, i, {from: owner});
                lendingMarkets.push(market.logs[0].args.marketAddr);

                let lendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr);
                await lendingMarket.setCollateral(collateral.address, {from: owner});

                await collateral.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
                await loan.addLendingMarket(Ccy.FIL, i, lendingMarket.address, {from: owner});
            }
        });
    });
});