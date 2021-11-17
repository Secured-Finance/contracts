const BytesConversion = artifacts.require('BytesConversion');
const { should } = require('chai');
should();

contract('BytesConversion', () => {
    let bytesConversion;

    let loan = "0xLoan";

    let IRSwapNI = "0xInterestRateSwapWithNotional";
    let IRSwapNE = "0xInterestRateSwapWithoutNotional";

    let forwardNI = "0xForwardWithNotional";
    let forwardNE = "0xForwardWithoutNotional";

    let bSwapNI = "0xBasisSwapWithNotional";
    let bSwapNE = "0xBasisSwapWithoutNotional";

    let TRSwapNI = "0xTotalReturnSwapWithNotional";
    let TRSwapNE = "0xTotalReturnSwapWithoutNotional";

    before('deploy BytesConversion', async () => {
        bytesConversion = await BytesConversion.new();
    });

    describe('Test bytes collisiton for financial products', () => {
        it('Test collision on full bytes32 hash', async () => {
            let res = await bytesConversion.getBytes32(loan);
            console.log(res);

            res = await bytesConversion.getBytes32(IRSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes32(IRSwapNE);
            console.log(res);

            res = await bytesConversion.getBytes32(forwardNI);
            console.log(res);

            res = await bytesConversion.getBytes32(forwardNE);
            console.log(res);

            res = await bytesConversion.getBytes32(bSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes32(bSwapNE);
            console.log(res);

            res = await bytesConversion.getBytes32(TRSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes32(TRSwapNE);
            console.log(res);
        });

        it('Test collision on shortened bytes4 hash', async () => {
            let res = await bytesConversion.getBytes4(loan);
            console.log(res);

            let id = await bytesConversion.generateDealID(loan, 124678);
            console.log(id);

            res = await bytesConversion.getPrefix(id);
            console.log(res)

            res = await bytesConversion.getMaxValue();
            console.log(res.toString())

            res = await bytesConversion.getBytes4(IRSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes4(IRSwapNE);
            console.log(res);

            res = await bytesConversion.getBytes4(forwardNI);
            console.log(res);

            res = await bytesConversion.getBytes4(forwardNE);
            console.log(res);

            res = await bytesConversion.getBytes4(bSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes4(bSwapNE);
            console.log(res);

            res = await bytesConversion.getBytes4(TRSwapNI);
            console.log(res);

            res = await bytesConversion.getBytes4(TRSwapNE);
            console.log(res);
        });

        it('Get gas costs for computing bytes32 hash', async () => {
            let res = await bytesConversion.getGasCostOfGetBytes32(loan);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(IRSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(IRSwapNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(forwardNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(forwardNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(bSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(bSwapNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(TRSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes32(TRSwapNE);
            console.log(res.toString());
        });

        it('Get gas costs for computing bytes4 hash', async () => {
            let res = await bytesConversion.getGasCostOfGetBytes4(loan);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(IRSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(IRSwapNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(forwardNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(forwardNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(bSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(bSwapNE);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(TRSwapNI);
            console.log(res.toString());

            res = await bytesConversion.getGasCostOfGetBytes4(TRSwapNE);
            console.log(res.toString());
        });
    });

});