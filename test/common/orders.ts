import BigNumberJS from 'bignumber.js';
import { BigNumber } from 'ethers';
import { Side } from '../../utils/constants';

import {
  ORDER_FEE_RATE,
  PCT_DIGIT,
  PRICE_DIGIT,
  SECONDS_IN_YEAR,
} from './constants';

export const calculateOrderFee = (
  orderAmount: BigNumber,
  unitPrice: BigNumber | string | number,
  currentMaturity: BigNumber,
) => {
  const fv = orderAmount.mul(PRICE_DIGIT).div(unitPrice);

  return fv
    .mul(ORDER_FEE_RATE)
    .mul(currentMaturity)
    .div(SECONDS_IN_YEAR)
    .div(PCT_DIGIT);
};

export const getAmountWithUnwindFee = (
  side: number,
  orderAmount: BigNumber,
  currentMaturity: BigNumber,
) => {
  return BigNumberJS(orderAmount.toString())
    .times(SECONDS_IN_YEAR)
    .times(PCT_DIGIT)
    .div(
      side === Side.LEND
        ? BigNumberJS(SECONDS_IN_YEAR)
            .times(PCT_DIGIT)
            .minus(
              BigNumberJS(ORDER_FEE_RATE).times(currentMaturity.toString()),
            )
        : BigNumberJS(SECONDS_IN_YEAR)
            .times(PCT_DIGIT)
            .plus(
              BigNumberJS(ORDER_FEE_RATE).times(currentMaturity.toString()),
            ),
    )
    .dp(0)
    .toFixed();
};

export const calculateFutureValue = (
  orderAmount: BigNumber,
  unitPrice: BigNumber | string | number,
) => {
  return BigNumberJS(orderAmount.toString())
    .times(PRICE_DIGIT)
    .div(unitPrice.toString())
    .dp(0)
    .toFixed();
};
