const AddressResolver = artifacts.require('AddressResolver');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { ethers } = require('hardhat');
const { toBytes32, zeroAddress } = require('../test-utils').strings;
const { PrintTable } = require('../test-utils').helper;
const { Deployment } = require('../test-utils').deployment;
const { should } = require('chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const utils = require('web3-utils');

should();

contract('TermStructure', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let termStructure;
  let currencyController;
  let productAddressResolver;
  let lendingMarketController;

  let loanPrefix = '0x21aaa47b';

  let filToETHRate = utils.toBN('67175250000000000');
  let ethToUSDRate = utils.toBN('232612637168');
  let btcToETHRate = utils.toBN('23889912590000000000');

  let filToETHPriceFeed;
  let btcToETHPriceFeed;
  let ethToUSDPriceFeed;

  let hexFILString = toBytes32('FIL');
  let hexETHString = toBytes32('ETH');
  let hexBTCString = toBytes32('BTC');

  const generateId = (value, prefix) => {
    let right = utils.toBN(utils.rightPad(prefix, 64));
    let left = utils.toBN(utils.leftPad(value, 64));

    let id = utils.numberToHex(right.or(left));

    return id;
  };

  before('deploy TermStructure contract', async () => {
    const addressResolver = await AddressResolver.new();

    const deployment = new Deployment();
    deployment.mock('AddressResolver').useValue(addressResolver);
    deployment
      .mock('ProductAddressResolver')
      .useFactory('ProductAddressResolverTest', (instances) => ({
        DealId: instances.dealIdLibrary.address,
      }))
      .deploy();

    deployment
      .mock('TermStructure')
      .useFactory('TermStructureTest', (instances) => ({
        QuickSort: instances.quickSortLibrary.address,
      }))
      .deploy(addressResolver.address);

    ({
      currencyController,
      discountFactorLibrary,
      lendingMarketController,
      loan,
      productAddressResolver,
      termStructure,
    } = await deployment.execute());

    filToETHPriceFeed = await MockV3Aggregator.new(
      18,
      hexFILString,
      filToETHRate,
    );
    ethToUSDPriceFeed = await MockV3Aggregator.new(
      8,
      hexETHString,
      ethToUSDRate,
    );
    btcToETHPriceFeed = await MockV3Aggregator.new(
      18,
      hexBTCString,
      btcToETHRate,
    );

    let tx = await currencyController.supportCurrency(
      hexETHString,
      'Ethereum',
      60,
      ethToUSDPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexBTCString,
      'Bitcoin',
      0,
      btcToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.updateCollateralSupport(hexETHString, true);
    expectEvent(tx, 'CcyCollateralUpdate');

    tx = await currencyController.updateMinMargin(hexETHString, 2500);
    expectEvent(tx, 'MinMarginUpdated');

    signers = await ethers.getSigners();

    await productAddressResolver.registerProduct(
      loanPrefix,
      loan.address,
      lendingMarketController.address,
      { from: owner },
    );

    let id = generateId(12, loanPrefix);
    let contract = await productAddressResolver.getProductContractByDealId(id);
    contract.should.be.equal(loan.address);

    contract = await productAddressResolver.getControllerContractByDealId(id);
    contract.should.be.equal(lendingMarketController.address);
  });

  describe('Test register product function', async () => {
    it('Successfully add new term via supportTerm function and check term creation', async () => {
      await termStructure.supportTerm(
        180,
        [loanPrefix],
        [hexETHString, hexBTCString, hexFILString],
        { from: owner },
      );

      let term = await termStructure.getTerm(180, 0);
      term[0].toString().should.be.equal('180');
      term[1].toString().should.be.equal('5000');
      term[2].toString().should.be.equal('1');

      console.group('PaymentSchedule: 180 days');
      for (let i = 0; i <= 4; i++) {
        let paymentSchedule = await termStructure.getTermSchedule(180, i);
        console.log(`${i} -> ${paymentSchedule.toString()}`);
      }
      console.groupEnd();
    });

    it('Try to add term by Alice, expect revert', async () => {
      expectRevert(
        termStructure
          .connect(signers[1])
          .supportTerm(90, [loanPrefix], [hexFILString], { from: alice }),
        '',
      );
      let term = await termStructure.connect(signers[0]).getTerm(90, 4);
      term[0].toString().should.be.equal('0');
    });

    it('Successfully add the rest of terms using supportTerm', async () => {
      let days = [90, 1825, 365, 1095, 730];
      let annualPayments = [1, 5, 1, 3, 2];
      let monthlyPayments = [3, 60, 12, 36, 24];
      let quartelyPayments = [1, 20, 4, 12, 8];
      let semiAnnualPayments = [1, 10, 2, 6, 4];
      let dfFracs = [2500, 10000, 10000, 10000, 10000];
      let schedules = [
        ['90'],
        ['365', '730', '1095', '1460', '1825'],
        ['365'],
        ['365', '730', '1095'],
        ['365', '730'],
      ];

      for (i = 0; i < days.length; i++) {
        await termStructure.supportTerm(
          days[i],
          [loanPrefix],
          [hexETHString, hexBTCString, hexFILString],
        );

        let term = await termStructure.getTerm(days[i], 0);
        term[0].toString().should.be.equal(days[i].toString());
        term[1].toString().should.be.equal(dfFracs[i].toString());
        term[2].toString().should.be.equal(annualPayments[i].toString());

        term = await termStructure.getTerm(days[i], 1);
        term[2].toString().should.be.equal(semiAnnualPayments[i].toString());

        term = await termStructure.getTerm(days[i], 2);
        term[2].toString().should.be.equal(quartelyPayments[i].toString());

        term = await termStructure.getTerm(days[i], 3);
        term[2].toString().should.be.equal(monthlyPayments[i].toString());

        console.group(`PaymentSchedule: ${days[i]} days`);
        for (let j = 0; j <= 4; j++) {
          let paymentSchedule = await termStructure.getTermSchedule(days[i], j);
          console.log(`${j} -> ${paymentSchedule.toString()}`);
        }
        console.groupEnd();
      }
    });
  });

  describe('Test term creation', async () => {
    it('Test terms sorting in getTermsForProductAndCcy function', async () => {
      let terms = await termStructure.getTermsForProductAndCcy(
        loanPrefix,
        hexFILString,
        true,
      );

      terms.forEach((term) => console.log(term.toString()));
    });
  });

  describe('Report gas consumption of view functions', async () => {
    it('Gas costs for getting contract addresses', async () => {
      const gasCostTable = new PrintTable('GasCost');

      await gasCostTable.add(
        'Get term information with monthly payment schedule',
        termStructure.getGasCostOfGetTerm(90, 3),
      );

      await gasCostTable.add(
        'Get term monthly schedule',
        termStructure.getGasCostOfGetTermSchedule(1825, 3),
      );

      await gasCostTable.add(
        'Get term annual schedule',
        termStructure.getGasCostOfGetTermSchedule(1825, 0),
      );

      await gasCostTable.add(
        'Get term semi-annual schedule',
        termStructure.getGasCostOfGetTermSchedule(1825, 1),
      );

      await gasCostTable.add(
        'Get term quarterly schedule',
        termStructure.getGasCostOfGetTermSchedule(1095, 2),
      );

      await gasCostTable.add(
        'Get term forward schedule',
        termStructure.getGasCostOfGetTermSchedule(730, 4),
      );

      await gasCostTable.add(
        'Get term number of days',
        termStructure.getGasCostOfGetNumDays(180),
      );

      await gasCostTable.add(
        'Get term discount factor fractions',
        termStructure.getGasCostOfGetDfFrac(365),
      );

      await gasCostTable.add(
        'Get term number of annual payments',
        termStructure.getGasCostOfGetNumPayments(365, 0),
      );

      await gasCostTable.add(
        'Get term number of semi-annual payments',
        termStructure.getGasCostOfGetNumPayments(1825, 1),
      );

      await gasCostTable.add(
        'Get term number of quarterly payments',
        termStructure.getGasCostOfGetNumPayments(730, 2),
      );

      await gasCostTable.add(
        'Get term number of monthly payments',
        termStructure.getGasCostOfGetNumPayments(1825, 3),
      );

      await gasCostTable.add(
        'Get term number of forward payments',
        termStructure.getGasCostOfGetNumPayments(1095, 4),
      );

      await gasCostTable.add(
        'verifying if term is supported',
        termStructure.getGasCostOfIsSupportedTerm(
          730,
          loanPrefix,
          hexBTCString,
        ),
      );

      await gasCostTable.add(
        'Get all supported terms for product and currency without sorting',
        termStructure.getGasCostOfGetTermsForProductAndCcy(
          loanPrefix,
          hexETHString,
          false,
        ),
      );

      await gasCostTable.add(
        'Get all supported terms for product and currency with sorting',
        termStructure.getGasCostOfGetTermsForProductAndCcy(
          loanPrefix,
          hexETHString,
          true,
        ),
      );

      gasCostTable.log();
    });
  });
});
