import BigNumber from 'bignumber.js';
import { task, types } from 'hardhat/config';
import { Side } from '../utils/constants';
import { currencies } from '../utils/currencies';
import { toBytes32 } from '../utils/strings';

task('register-orders', 'Registers order data into the selected lending market')
  .addParam('collateralCurrency', 'Target collateral currency with short name')
  .addParam('marketCurrency', 'Target market currency with short name')
  .addParam('maturity', 'Target market maturity')
  .addParam('midUnitPrice', 'Target mid unit price', undefined, types.string)
  .addParam('amount', 'Order base amount', undefined, types.string)
  .addParam('orderCount', 'Order count', undefined, types.int)
  .setAction(
    async (
      {
        collateralCurrency,
        marketCurrency,
        maturity,
        midUnitPrice,
        amount,
        orderCount,
      },
      { deployments, ethers },
    ) => {
      const [owner] = await ethers.getSigners();
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const contracts = [
        'LendingMarketController',
        'TokenVault',
        'CurrencyController',
      ];

      const [lendingMarketController, tokenVault, currencyController] =
        await Promise.all(
          contracts.map((contract) =>
            proxyController
              .getAddress(toBytes32(contract))
              .then((address: string) =>
                ethers.getContractAt(contract, address),
              ),
          ),
        );

      const marketCurrencyName = toBytes32(marketCurrency);
      const collateralCurrencyName = toBytes32(collateralCurrency);
      const maturities: BigNumber[] =
        await lendingMarketController.getMaturities(marketCurrencyName);

      const maturityIndex = maturities.findIndex(
        (value) => value.toString() === maturity,
      );

      if (maturityIndex === -1) {
        const msg = `Invalid maturity: 'maturity' must be ${maturities.join(
          ', ',
        )}`;
        throw new Error(msg);
      }

      const boxMuller = (n: number) => {
        const results: number[][] = [];
        for (let i = 0; i < n; i++) {
          const R = Math.sqrt(-2 * Math.log(Math.random()));
          const theta = 2 * Math.PI * Math.random();
          results.push([R * Math.cos(theta), Math.sin(theta)]);
        }
        return results;
      };

      // Create random amounts and rats
      const orders: { side: number; amount: string; unitPrice: string }[] = [];
      let totalBorrowAmount = BigNumber(0);
      let totalLendAmount = BigNumber(0);

      for (const [dAmount, dUnitPrice] of boxMuller(orderCount)) {
        const orderAmount = BigNumber(dAmount)
          .times(amount)
          .div(2)
          .plus(amount)
          .dp(0);
        const orderUnitPrice = BigNumber(dUnitPrice)
          .times(midUnitPrice)
          .div(20)
          .plus(midUnitPrice)
          .dp(0);
        const orderSide = orderUnitPrice.gte(midUnitPrice)
          ? Side.LEND
          : Side.BORROW;

        if (
          orderAmount.lte('0') ||
          orderUnitPrice.lte('0') ||
          orderUnitPrice.gt('10000')
        ) {
          continue;
        } else {
          orders.push({
            side: orderSide,
            amount: orderAmount.toFixed(),
            unitPrice: orderUnitPrice.toFixed(),
          });

          if (orderSide === Side.BORROW) {
            totalBorrowAmount = totalBorrowAmount.plus(orderAmount);
          } else {
            totalLendAmount = totalLendAmount.plus(orderAmount);
          }
        }
      }

      // Add collateral
      const availableAmountInETH = await tokenVault.getWithdrawableCollateral(
        owner.address,
      );

      if (marketCurrency !== 'ETH') {
        const currency = currencies.find(
          ({ key }) => key === marketCurrencyName,
        );

        if (currency) {
          const token = await deployments
            .get(currency.mock)
            .then(({ address }) =>
              ethers.getContractAt(currency.mock, address),
            );

          const allowance = await token.allowance(
            owner.address,
            tokenVault.address,
          );

          if (totalLendAmount.gt(allowance.toString())) {
            await token
              .approve(tokenVault.address, ethers.constants.MaxUint256)
              .then((tx) => tx.wait());
          }
        }
      }

      if (collateralCurrency !== 'ETH') {
        const currency = currencies.find(
          ({ key }) => key === collateralCurrencyName,
        );

        if (currency) {
          const token = await deployments
            .get(currency.mock)
            .then(({ address }) =>
              ethers.getContractAt(currency.mock, address),
            );

          const allowance = await token.allowance(
            owner.address,
            tokenVault.address,
          );

          if (totalBorrowAmount.gt(allowance.toString())) {
            await token
              .approve(tokenVault.address, ethers.constants.MaxUint256)
              .then((tx) => tx.wait());
          }
        }
      }

      const depositValue = BigNumber(totalBorrowAmount.toString())
        .times(2)
        .dp(0);

      const depositValueInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](marketCurrencyName, depositValue.toFixed());
      if (
        BigNumber(depositValueInETH.toString())
          .times(2)
          .lt(availableAmountInETH.toString())
      ) {
        console.log('Skipped deposit');
        console.log(
          'The current amount available is',
          availableAmountInETH.toString(),
        );
      } else {
        const depositValueInCollateralCurrency =
          await currencyController.convertFromETH(
            collateralCurrencyName,
            depositValueInETH.toString(),
          );

        await tokenVault
          .deposit(
            collateralCurrencyName,
            depositValueInCollateralCurrency.toString(),
            {
              value:
                collateralCurrency === 'ETH'
                  ? depositValueInCollateralCurrency.toString()
                  : 0,
            },
          )
          .then((tx) => tx.wait());

        console.log(
          `Successfully deposited ${depositValueInCollateralCurrency.toString()} in ${collateralCurrency}`,
        );
      }

      // Create orders
      for (const order of orders) {
        if (order.side === Side.LEND) {
          if (marketCurrency === 'ETH') {
            await lendingMarketController
              .depositAndCreateLendOrderWithETH(
                marketCurrencyName,
                maturity,
                order.unitPrice,
                {
                  value: order.amount,
                },
              )
              .then((tx) => tx.wait());
          } else {
            await lendingMarketController
              .depositAndCreateOrder(
                marketCurrencyName,
                maturity,
                order.side,
                order.amount,
                order.unitPrice,
              )
              .then((tx) => tx.wait());
          }
        } else {
          await lendingMarketController
            .createOrder(
              marketCurrencyName,
              maturity,
              order.side,
              order.amount,
              order.unitPrice,
            )
            .then((tx) => tx.wait());
        }
      }

      console.table(
        orders.map((order) => ({
          Side: order.side === 0 ? 'LEND' : 'BORROW',
          Amount: order.amount,
          Rate: order.unitPrice,
        })),
      );

      console.log('Successfully registered orders');

      // Show orders in the market
      const borrowUnitPrices = await lendingMarketController.getBorrowOrderBook(
        marketCurrencyName,
        maturity,
        10,
      );
      const lendUnitPrices = await lendingMarketController.getLendOrderBook(
        marketCurrencyName,
        maturity,
        10,
      );

      const getOrderBookObject = (obj: {
        unitPrices: BigNumber[];
        amounts: BigNumber[];
        quantities: BigNumber[];
      }) => {
        return obj.unitPrices.map((unitPrice, idx) => ({
          unitPrice,
          amount: obj.amounts[idx],
          quantity: obj.quantities[idx],
        }));
      };

      const orderBook = [
        ...getOrderBookObject(lendUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .sort((a, b) => (a.unitPrice.gte(b.unitPrice) ? -1 : 1))
          .map(({ unitPrice, amount, quantity }) => ({
            Lend: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
        ...getOrderBookObject(borrowUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .map(({ unitPrice, amount, quantity }) => ({
            Borrow: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
      ];

      console.log('Current order book is:');
      console.table(orderBook);
    },
  );
