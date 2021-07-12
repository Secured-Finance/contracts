// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

library DiscountFactor {
    using SafeMath for uint256;
    uint8 internal constant NUMDF = 7; // number of discount factors
    uint256 internal constant BP = 10000; // basis point

    // Mark to market mechanism
    struct DF {
        uint256 df3m;
        uint256 df6m;
        uint256 df1y;
        uint256 df2y;
        uint256 df3y;
        uint256 df4y;
        uint256 df5y;
    }

    // helper to generate DF
    function genDF(DF memory self, uint256[NUMDF] memory rates) private pure returns (DF memory) {
        self.df3m = BP.mul(BP).div((BP.add(rates[0].mul(90).div(360))));
        self.df6m = BP.mul(BP).div((BP.add(rates[1].mul(180).div(360))));
        self.df1y = BP.mul(BP).div((BP.add(rates[2]))); 
        self.df2y = BP.mul(BP.sub(rates[3].mul(self.df1y).div(BP))).div(BP.add(rates[3]));
        self.df3y = BP.mul(BP.sub(rates[4].mul(self.df1y.add(self.df2y)).div(BP))).div(BP.add(rates[4]));
        self.df4y = BP.mul(BP.sub(rates[5].mul(self.df1y.add(self.df2y).add(self.df3y)).div(BP))).div(BP.add(rates[5]));
        self.df5y = BP.mul(BP.sub(rates[6].mul(self.df1y.add(self.df2y).add(self.df3y).add(self.df4y)).div(BP))).div(BP.add(rates[6]));
        return self;
    }

    /**
    * @dev Triggers to adjust discount factors by interpolating to current loan maturity
    * @param self Discount factor structure
    * @param date Date to calculate discount factors for 
    *
    * @notice Executed internally
    */
    function interpolateDF(DF memory self, uint256 date, uint256[NUMDF] memory sec)
        internal
        view
        returns (uint256)
    {
        uint256[NUMDF] memory dfArr = [
            self.df3m,
            self.df6m,
            self.df1y,
            self.df2y,
            self.df3y,
            self.df4y,
            self.df5y
        ];

        uint256 time = date.sub(block.timestamp);

        if (time <= sec[0]) {
            uint256 left = sec[0].sub(time);

            return (BP.mul(left).add(dfArr[0].mul(time))).div(sec[0]);
        } else {
            for (uint256 i = 1; i < NUMDF; i++) {
                if (sec[i - 1] < time && time <= sec[i]) {
                    uint256 left = time.sub(sec[i - 1]);
                    uint256 right = sec[i].sub(time);
                    uint256 total = sec[i].sub(sec[i - 1]);
                    return ((dfArr[i - 1].mul(right)).add((dfArr[i].mul(left))).div(total));
                }
            }
        }
    }

}