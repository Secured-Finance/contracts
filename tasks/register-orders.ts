import BigNumber from 'bignumber.js';
import { task, types } from 'hardhat/config';
import { Side } from '../utils/constants';
import { currencies } from '../utils/currencies';
import { toBytes32 } from '../utils/strings';

task('register-orders', 'Registers order data into the selected lending market')
  .addParam('currency', 'Target currency short name')
  .addParam('maturity', 'Target market maturity')
  .addParam('midUnitPrice', 'Target mid unit price', undefined, types.string)
  .addParam('amount', 'Order base amount', undefined, types.string)
  .addParam('orderCount', 'Order count', undefined, types.int)
  .setAction(
    async (
      { currency, maturity, midUnitPrice, amount, orderCount },
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

      const currencyName = toBytes32(currency);
      const maturities: BigNumber[] =
        await lendingMarketController.getMaturities(currencyName);

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

      for (const [dAmount, dRate] of boxMuller(orderCount)) {
        const orderAmount = BigNumber(dAmount)
          .times(amount)
          .div(2)
          .plus(amount)
          .dp(0);
        const orderRate = BigNumber(dRate)
          .times(midUnitPrice)
          .div(20)
          .plus(midUnitPrice)
          .dp(0);
        const orderSide = orderRate.gte(midUnitPrice) ? Side.LEND : Side.BORROW;

        if (orderAmount.lte('0') || orderRate.lte('0')) {
          continue;
        } else {
          orders.push({
            side: orderSide,
            amount: orderAmount.toFixed(),
            unitPrice: orderRate.toFixed(),
          });

          if (orderSide === Side.BORROW) {
            totalBorrowAmount = totalBorrowAmount.plus(orderAmount);
          } else {
            totalLendAmount = totalLendAmount.plus(orderAmount);
          }
        }
      }

      // Add collateral
      const availableAmount = await tokenVault.getWithdrawableCollateral(
        owner.address,
      );

      if (currency !== 'ETH') {
        const currency = currencies.find(({ key }) => key === currencyName);

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

          const totalAmount = totalLendAmount.plus(totalBorrowAmount);
          if (totalAmount.gt(allowance.toString())) {
            await token
              .approve(tokenVault.address, ethers.constants.MaxUint256)
              .then((tx) => tx.wait());
          }
        }
      }

      const depositValueInETH = BigNumber(totalBorrowAmount.toString())
        .times(3)
        .div(2)
        .plus(totalLendAmount)
        .minus(availableAmount.toString())
        .dp(0);
      if (
        BigNumber(depositValueInETH.toString())
          .times(2)
          .lt(availableAmount.toString())
      ) {
        console.log('Skipped deposit');
        console.log(
          'The current amount available is',
          availableAmount.toString(),
        );
      } else {
        const depositValue = await currencyController[
          'convertFromETH(bytes32,uint256)'
        ](currencyName, depositValueInETH.toString());

        await tokenVault
          .deposit(currencyName, depositValue, {
            value: currency === 'ETH' ? depositValue : 0,
          })
          .then((tx) => tx.wait());

        console.log(`Successfully deposited ${depositValue} in ETH`);
      }

      // Create orders
      for (const order of orders) {
        if (order.side === Side.LEND && currency === 'ETH') {
          await lendingMarketController
            .createLendOrderWithETH(currencyName, maturity, order.unitPrice, {
              value: order.amount,
            })
            .then((tx) => tx.wait());
        } else {
          await lendingMarketController
            .createOrder(
              currencyName,
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
        currencyName,
        maturity,
        10,
      );
      const lendUnitPrices = await lendingMarketController.getLendOrderBook(
        currencyName,
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
