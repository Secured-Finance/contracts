import BigNumber from 'bignumber.js';
import { task, types } from 'hardhat/config';
import { Side } from '../utils/constants';
import { currencies } from '../utils/currencies';
import { toBytes32 } from '../utils/strings';

task('register-orders', 'Registers order data into the selected lending market')
  .addParam('currency', 'Target currency short name')
  .addParam('maturity', 'Target market maturity')
  .addParam('midRate', 'Target mid rate', undefined, types.string)
  .addParam('amount', 'Order base amount', undefined, types.string)
  .addParam('orderCount', 'Order count', undefined, types.int)
  .setAction(
    async (
      { currency, maturity, midRate, amount, orderCount },
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
      const orders: { side: number; amount: string; rate: string }[] = [];
      let totalBorrowAmount = BigNumber(0);
      let totalLendAmount = BigNumber(0);

      for (const [dAmount, dRate] of boxMuller(orderCount)) {
        const orderAmount = BigNumber(dAmount)
          .times(amount)
          .div(2)
          .plus(amount)
          .dp(0);
        const orderRate = BigNumber(dRate)
          .times(midRate)
          .div(20)
          .plus(midRate)
          .dp(0);
        const orderSide = orderRate.gte(midRate) ? Side.LEND : Side.BORROW;

        if (orderAmount.lte('0') || orderRate.lte('0')) {
          continue;
        } else {
          orders.push({
            side: orderSide,
            amount: orderAmount.toFixed(),
            rate: orderRate.toFixed(),
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

      const totalBorrowAmountInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](currencyName, totalBorrowAmount.toFixed());

      if (
        BigNumber(totalBorrowAmountInETH.toString())
          .times(2)
          .lt(availableAmount.toString())
      ) {
        console.log('Skipped deposit');
        console.log(
          'The current amount available is',
          availableAmount.toString(),
        );
      } else {
        const depositValue = BigNumber(totalBorrowAmountInETH.toString())
          .times(2)
          .minus(availableAmount.toString())
          .dp(0)
          .toFixed();

        await tokenVault
          .deposit(toBytes32('ETH'), depositValue, {
            value: depositValue,
          })
          .then((tx) => tx.wait());

        console.log(`Successfully deposited ${depositValue} in ETH`);
      }

      if (currency !== 'ETH') {
        const currency = currencies.find(({ key }) => key === currencyName);

        if (currency) {
          const token = await deployments
            .get(currency.mock)
            .then(({ address }) =>
              ethers.getContractAt(currency.mock, address),
            );

          await token
            .approve(tokenVault.address, totalLendAmount.toFixed())
            .then((tx) => tx.wait());
        }
      }

      // Create orders
      for (const order of orders) {
        if (order.side === Side.LEND && currency === 'ETH') {
          await lendingMarketController
            .createLendOrderWithETH(currencyName, maturity, order.rate, {
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
              order.rate,
            )
            .then((tx) => tx.wait());
        }
      }

      console.table(
        orders.map((order) => ({
          Side: order.side === 0 ? 'LEND' : 'BORROW',
          Amount: order.amount,
          Rate: order.rate,
        })),
      );

      console.log('Successfully registered orders');

      // Show orders in the market
      const lendingMarketAddresses =
        await lendingMarketController.getLendingMarkets(currencyName);

      const lendingMarket = await ethers.getContractAt(
        'LendingMarket',
        lendingMarketAddresses[maturityIndex],
      );

      const borrowRates: BigNumber[] = await lendingMarket.getBorrowRates(10);
      const lendRates: BigNumber[] = await lendingMarket.getLendRates(10);

      const orderBook = [
        ...lendRates
          .filter((rate) => rate.toString() !== '0')
          .sort((a, b) => (a.gte(b) ? -1 : 1))
          .map((rate) => ({ LEND: rate.toString() })),
        ...borrowRates
          .filter((rate) => rate.toString() !== '0')
          .map((rate) => ({ Borrow: rate.toString() })),
      ];

      console.log('Current order book is:');
      console.table(orderBook);
    },
  );
