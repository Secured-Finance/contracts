// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

library DiscountFactor {
    using SafeMath for uint256;

    uint256 internal constant BP = 10000; // basis point
    uint256 internal constant NON_ANNUAL_TERMS = 3;

    function determineDF(
        uint256 rate,
        uint256 term,
        uint256[] memory cache,
        uint256 dfSum,
        uint256 index
    ) internal pure returns (uint256 df) {
        if (term < 365) {
            df = BP.mul(BP).div((BP.add(rate.mul(term).div(360))));
        } else if (term == 365) {
            df = BP.mul(BP).div((BP.add(rate)));
            dfSum = dfSum.add(df);
        } else {
            uint256 rateSum = (rate.mul(dfSum)).div(BP);
            if (rateSum > BP) {
                df = 0;
            } else {
                df = BP.mul(BP.sub(rate.mul(dfSum).div(BP))).div(BP.add(rate));
            }
            dfSum = dfSum.add(df);
        }

        cache[index] = df;

        return dfSum;
    }

    function calculateDFs(uint256[] memory rates, uint256[] memory terms)
        public
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        require(rates.length == terms.length, "INVALID_PARAMS");

        (
            uint256[] memory bootstrapedRates,
            uint256[] memory bootstrapedTerms
        ) = bootstrapTerms(rates, terms);

        uint256 len = bootstrapedTerms.length;
        uint256[] memory dfs = new uint256[](len);
        uint256 dfSum;

        for (uint256 i = 0; i < len; i++) {
            dfSum = determineDF(
                bootstrapedRates[i],
                bootstrapedTerms[i],
                dfs,
                dfSum,
                i
            );
        }

        return (dfs, bootstrapedTerms);
    }

    function maxDFs(uint256 maxTerm) internal pure returns (uint256) {
        return maxTerm.div(365).add(NON_ANNUAL_TERMS);
    }

    struct TermBootstrapingLocalVars {
        uint256 extendedTerms;
        uint256 delta;
        uint256 numItems;
        uint256 lastKnownRate;
        uint256 nextKnownRate;
        uint256 nextKnownTerm;
        bool upwards;
        uint256 deltaRate;
        uint256 step;
    }

    function bootstrapTerms(uint256[] memory rates, uint256[] memory terms)
        public
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        uint256 len = maxDFs(terms[terms.length - 1]);

        uint256[] memory filledRates = new uint256[](len);
        uint256[] memory filledTerms = new uint256[](len);
        TermBootstrapingLocalVars memory vars;

        for (uint256 i = 0; i < terms.length.sub(1); i++) {
            if (terms[i] < 365) {
                filledRates[i] = rates[i];
                filledTerms[i] = terms[i];
                continue;
            }
            vars.delta = terms[i + 1].sub(terms[i]);

            if (vars.delta <= 365) {
                filledRates[i] = rates[i];
                filledTerms[i] = terms[i];
                continue;
            }

            vars.numItems = vars.delta.div(365);
            vars.lastKnownRate = rates[i];

            if (vars.extendedTerms == 0) {
                filledRates[i] = vars.lastKnownRate;
                filledTerms[i] = terms[i];
            }
            vars.nextKnownRate = rates[i + 1];
            vars.nextKnownTerm = terms[i + 1];
            vars.upwards = vars.nextKnownRate > vars.lastKnownRate
                ? true
                : false;
            vars.deltaRate = vars.upwards
                ? vars.nextKnownRate.sub(vars.lastKnownRate)
                : vars.lastKnownRate.sub(vars.nextKnownRate);
            vars.step = vars.deltaRate.div(vars.numItems);

            for (uint256 j = 1; j < vars.numItems; j++) {
                vars.extendedTerms = vars.extendedTerms.add(1);

                uint256 newIndex = i.add(vars.extendedTerms);
                uint256 missedRate = vars.upwards
                    ? filledRates[newIndex.sub(1)].add(vars.step)
                    : filledRates[newIndex.sub(1)].sub(vars.step);
                uint256 missedTerm = terms[i].add(uint256(365).mul(j));

                filledRates[newIndex] = missedRate;
                filledTerms[newIndex] = missedTerm;

                if (j == vars.numItems.sub(1)) {
                    uint256 shifterIndex = newIndex.add(1);

                    filledRates[shifterIndex] = vars.nextKnownRate;
                    filledTerms[shifterIndex] = vars.nextKnownTerm;
                }
            }
        }

        return (filledRates, filledTerms);
    }

    struct DFInterpolationLocalVars {
        uint256 timeDelta;
        uint256 termSeconds;
        uint256 prevTermSeconds;
        uint256 left;
        uint256 right;
        uint256 total;
    }

    /**
     * @dev Triggers to adjust discount factors by interpolating to current loan maturity
     * @param discountFactors Discount factors array
     * @param terms Array of terms
     * @param date Date to calculate discount factors for
     *
     */
    function interpolateDF(
        uint256[] memory discountFactors,
        uint256[] memory terms,
        uint256 date
    ) public view returns (uint256) {
        DFInterpolationLocalVars memory vars;
        vars.timeDelta = date.sub(block.timestamp);

        if (vars.timeDelta <= terms[0].mul(86400)) {
            vars.termSeconds = terms[0].mul(86400);
            vars.left = vars.termSeconds.sub(vars.timeDelta);

            return
                (BP.mul(vars.left).add(discountFactors[0].mul(vars.timeDelta)))
                    .div(vars.termSeconds);
        } else {
            for (uint256 i = 1; i < terms.length; i++) {
                vars.termSeconds = terms[i].mul(86400);
                vars.prevTermSeconds = terms[i - 1].mul(86400);

                if (
                    vars.prevTermSeconds < vars.timeDelta &&
                    vars.timeDelta <= vars.termSeconds
                ) {
                    vars.left = vars.timeDelta.sub(vars.prevTermSeconds);

                    if (vars.left == 0) {
                        return discountFactors[i]; // gas savings only
                    }

                    vars.right = vars.termSeconds.sub(vars.timeDelta);
                    if (vars.right == 0) {
                        return discountFactors[i];
                    }

                    vars.total = vars.termSeconds.sub(vars.prevTermSeconds);

                    return (
                        (discountFactors[i - 1].mul(vars.right))
                            .add((discountFactors[i].mul(vars.left)))
                            .div(vars.total)
                    );
                }
            }
        }
    }
}
