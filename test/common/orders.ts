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
  orderAmount: BigNumber | string,
  unitPrice: BigNumber | string | number,
  currentMaturity: BigNumber,
) => {
  const fv = BigNumberJS(orderAmount.toString())
    .times(PRICE_DIGIT)
    .div(unitPrice.toString());

  return BigNumber.from(
    fv
      .times(ORDER_FEE_RATE)
      .times(currentMaturity.toString())
      .div(SECONDS_IN_YEAR)
      .div(PCT_DIGIT)
      .dp(0)
      .toFixed(),
  );
};

export const getAmountWithOrderFee = (
  side: number,
  orderAmount: BigNumber,
  currentMaturity: BigNumber,
) => {
  return BigNumber.from(
    BigNumberJS(orderAmount.toString())
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
      .toFixed(),
  );
};

export const calculateFutureValue = (
  orderAmount: BigNumber | string,
  unitPrice: BigNumber | string | number,
) => {
  return BigNumber.from(
    BigNumberJS(orderAmount.toString())
      .times(PRICE_DIGIT)
      .div(unitPrice.toString())
      .dp(0)
      .toFixed(),
  );
};

export const calculatePresentValue = (
  orderAmount: BigNumber | string,
  unitPrice: BigNumber | string | number,
) => {
  return BigNumber.from(
    BigNumberJS(orderAmount.toString())
      .times(unitPrice.toString())
      .div(PRICE_DIGIT)
      .dp(0)
      .toFixed(),
  );
};

export const calculateAutoRolledLendingCompoundFactor = (
  compoundFactor: BigNumber,
  currentMaturity: BigNumber,
  unitPrice: BigNumber | number,
) => {
  return BigNumber.from(
    BigNumberJS(
      compoundFactor
        .mul(
          BigNumber.from(PRICE_DIGIT)
            .mul(PCT_DIGIT)
            .mul(SECONDS_IN_YEAR)
            .sub(currentMaturity.mul(unitPrice).mul(ORDER_FEE_RATE)),
        )
        .toString(),
    )
      .div(
        BigNumber.from(PRICE_DIGIT)
          .mul(SECONDS_IN_YEAR)
          .mul(unitPrice)
          .toString(),
      )
      .dp(0)
      .toFixed(),
  );
};

export const calculateAutoRolledBorrowingCompoundFactor = (
  compoundFactor: BigNumber,
  currentMaturity: BigNumber,
  unitPrice: BigNumber | number,
) => {
  return BigNumber.from(
    BigNumberJS(
      compoundFactor
        .mul(
          BigNumber.from(PRICE_DIGIT)
            .mul(PCT_DIGIT)
            .mul(SECONDS_IN_YEAR)
            .add(currentMaturity.mul(unitPrice).mul(ORDER_FEE_RATE)),
        )
        .toString(),
    )
      .div(
        BigNumber.from(PRICE_DIGIT)
          .mul(SECONDS_IN_YEAR)
          .mul(unitPrice)
          .toString(),
      )
      .dp(0)
      .toFixed(),
  );
};

export const calculateFVFromFV = (
  futureValue: BigNumber,
  compoundFactorFrom: BigNumber,
  compoundFactorTo: BigNumber,
  gvDecimals: number,
) => {
  const gvDigit = BigNumberJS(10).pow(gvDecimals.toString());

  return BigNumber.from(
    BigNumberJS(futureValue.toString())
      .times(gvDigit)
      .div(compoundFactorFrom.toString())
      .dp(0, BigNumberJS.ROUND_DOWN)
      .times(compoundFactorTo.toString())
      .div(gvDigit)
      .dp(0, BigNumberJS.ROUND_UP)
      .toFixed(),
  );
};

export const calculateGVFromFV = (
  futureValue: BigNumber,
  compoundFactor: BigNumber,
  gvDecimals: number,
) => {
  const gvDigit = BigNumberJS(10).pow(gvDecimals.toString());

  return BigNumber.from(
    BigNumberJS(futureValue.toString())
      .times(gvDigit)
      .div(compoundFactor.toString())
      .dp(0, BigNumberJS.ROUND_DOWN)
      .toFixed(),
  );
};
