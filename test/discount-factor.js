const BokkyPooBahsDateTimeContract = artifacts.require('BokkyPooBahsDateTimeContract');
const { should } = require('chai');
const { ethers } = require('hardhat');
const utils = require('web3-utils');

should();

contract('Discount Factor Test', async () => {
    let discountFactorTest;
    let discountFactor;
    let timeLibrary;

    const BP = utils.toBN('10000');

    let rates15y = [200, 300, 400, 500, 600, 700, 900, 1250, 1750];
    let terms15y = [30, 90, 180, 365, 730, 1095, 1825, 3650, 5475];

    let rates5y = [200, 300, 400, 500, 600, 700, 900];
    let terms5y = [30, 90, 180, 365, 730, 1095, 1825];

    function calculateDF(rate, term, prevDF) {
        rate = utils.toBN(rate);

        if (term < 365) {
            df = BP.mul(BP).div((BP.add(rate.mul(utils.toBN(term)).div(utils.toBN(360)))));
        } else if (term == 365) {
            df = BP.mul(BP).div((BP.add(rate)));
        } else {
            prevDF = utils.toBN(prevDF);

            df = BP.mul(BP.sub(rate.mul(prevDF).div(BP))).div(BP.add(rate));
        }

        return df;
    }

    function calculateDFs(rates, terms) {
        let dfs = new Array();

        for (i = 0; i < rates.length; i++) {
            dfs[i] = calculateDF(rates[i], terms[i], dfs[i-1]);
        }

        return dfs;
    }

    before('deploy DiscountFactor library and mock test contract', async () => {
        const DiscountFactor = await ethers.getContractFactory('DiscountFactor')
        const discountFactor = await DiscountFactor.deploy();
        await discountFactor.deployed();
        timeLibrary = await BokkyPooBahsDateTimeContract.new();

        const dfTestFactory = await ethers.getContractFactory(
            'DiscountFactorTest',
            {
                libraries: {
                    DiscountFactor: discountFactor.address
                }
              }
            )
        discountFactorTest = await dfTestFactory.deploy();
    });

    describe('Test bootstraping terms for missed terms', () => {
        it('Test filling rates with missed values up to 15y maturity', async () => {
            const newTerms = [30, 90, 180, 365, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650, 4015, 4380, 4745, 5110, 5475];
            //                                               6        //8      9    10    11    12  //13    14    15    16    17
            const newRates = [200, 300, 400, 500, 600, 700, 800, 900, 970, 1040, 1110, 1180, 1250, 1350, 1450, 1550, 1650, 1750];

            let interpolatedRates = await discountFactorTest.bootstrapTerms(rates15y, terms15y);
            interpolatedRates[0].toString().should.be.equal(newRates.toString());
            interpolatedRates[1].toString().should.be.equal(newTerms.toString());
        });
    
        it('Test filling rates with missed values up to 5 maturity', async () => {
            const newTerms = [30, 90, 180, 365, 730, 1095, 1460, 1825];
            const newRates = [200, 300, 400, 500, 600, 700, 800, 900];

            let interpolatedRates = await discountFactorTest.bootstrapTerms(rates5y, terms5y);
            interpolatedRates[0].toString().should.be.equal(newRates.toString());
            interpolatedRates[1].toString().should.be.equal(newTerms.toString());
        });
    });

    describe('Test calculation of discount factors', () => {
        it('Test calculation of discount factors for terms up to 5 year maturity', async () => {
            let interpolatedRates = await discountFactorTest.bootstrapTerms(rates5y, terms5y);
            let df = calculateDFs(interpolatedRates[0], interpolatedRates[1]);
            let discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);

            df.toString().should.be.equal(discountFactors[0].toString());
        });

        it('Test calculation of discount factors for terms up to 15 year maturity', async () => {
            let interpolatedRates = await discountFactorTest.bootstrapTerms(rates15y, terms15y);
            let df = calculateDFs(interpolatedRates[0], interpolatedRates[1]);
            let discountFactors = await discountFactorTest.calculateDFs(rates15y, terms15y);

            df.toString().should.be.equal(discountFactors[0].toString());
        });
    });

    describe('Test interpolation of discount factors', () => {
        let time;
        let discountFactors
        let shiftedTime;

        it('Test interpolation of discount factors 15 days later', async () => {
            time = await timeLibrary._now();
            shiftedTime = await timeLibrary.addDays(time, 15);
            discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);

            let interpolatedDF = await discountFactorTest.interpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );

            const expectedDF = (BP.add(utils.toBN(discountFactors[0][0]))).div(utils.toBN(2));
            expectedDF.toString().should.be.equal(interpolatedDF.toString());
        });

        it('Test interpolation of discount factors 135 days later', async () => {
            time = await timeLibrary._now();
            shiftedTime = await timeLibrary.addDays(time, 135);
            discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);

            let interpolatedDF = await discountFactorTest.interpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );

            const expectedDF = (utils.toBN(discountFactors[0][1]).add(utils.toBN(discountFactors[0][2]))).div(utils.toBN(2));
            expectedDF.toString().should.be.equal(interpolatedDF.toString());
        });

        it('Test interpolation of discount factors 135 days later', async () => {
            time = await timeLibrary._now();
            shiftedTime = await timeLibrary.addDays(time, 365);
            discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);

            let interpolatedDF = await discountFactorTest.interpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );

            const expectedDF = discountFactors[0][3].toString();
            expectedDF.should.be.equal(interpolatedDF.toString());
        });

    });

    describe('Calculate gas costs', () => {
        it('Gas costs for bootstraping operations', async () => {
            let gasCost = await discountFactorTest.getGasCostOfBootstrapTerms(rates5y, terms5y);
            console.log("Gas cost for bootstrapping 5 year rates is " + gasCost.toString() + " gas");

            gasCost = await discountFactorTest.getGasCostOfBootstrapTerms(rates15y, terms15y);
            console.log("Gas cost for bootstrapping 15 year rates is " + gasCost.toString() + " gas");
        });

        it('Gas costs for discount factor calculations', async () => {
            let gasCost = await discountFactorTest.getGasCostOfCalculateDFs(rates5y, terms5y);
            console.log("Gas cost for calculating discount factors for 5 year rates is " + gasCost.toString() + " gas");

            gasCost = await discountFactorTest.getGasCostOfCalculateDFs(rates15y, terms15y);
            console.log("Gas cost for calculating discount factors for 15 year rates is " + gasCost.toString() + " gas");
        });

        it('Gas costs for discount factor interpolation', async () => {
            let time = await timeLibrary._now();
            let shiftedTime = await timeLibrary.addYears(time, 3);
            shiftedTime = await timeLibrary.addDays(shiftedTime, 364);
            let discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);

            let gasCost = await discountFactorTest.getGasCostOfInterpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );
            console.log("Gas cost for interpolating discount factor for 4 year rate is " + gasCost.toString() + " gas");

            discountFactors = await discountFactorTest.calculateDFs(rates5y, terms5y);
            shiftedTime = await timeLibrary.addDays(shiftedTime, 180);
            gasCost = await discountFactorTest.getGasCostOfInterpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );

            console.log("Gas cost for interpolating discount factor for 4.5 year rate is " + gasCost.toString() + " gas");

            discountFactors = await discountFactorTest.calculateDFs(rates15y, terms15y);
            shiftedTime = await timeLibrary.addYears(shiftedTime, 8);
            gasCost = await discountFactorTest.getGasCostOfInterpolateDF(
                discountFactors[0],
                discountFactors[1],
                shiftedTime.toString()
            );

            console.log("Gas cost for interpolating discount factor for 12.5 year rate is " + gasCost.toString() + " gas");
        });
    });
});