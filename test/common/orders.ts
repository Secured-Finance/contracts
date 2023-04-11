import { BigNumber } from 'ethers';
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

export const calculateFutureValue = (
  orderAmount: BigNumber,
  unitPrice: BigNumber | string | number,
) => {
  return orderAmount.mul(PRICE_DIGIT).div(unitPrice);
};
