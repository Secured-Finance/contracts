import BigNumberJS from 'bignumber.js';
import { BigNumber } from 'ethers';
import { task, types } from 'hardhat/config';
import { Side } from '../utils/constants';
import { currencies } from '../utils/currencies';
import { toBytes32 } from '../utils/strings';

const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'address', name: '', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'guy', type: 'address' },
      { internalType: 'uint256', name: 'wad', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

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

      // Create random amounts and unit prices
      const orders: { side: number; amount: string; unitPrice: string }[] = [];
      let totalBorrowAmount = BigNumber.from(0);
      let totalLendAmount = BigNumber.from(0);

      for (const [dAmount, dUnitPrice] of boxMuller(orderCount)) {
        const orderAmount = BigNumberJS(dAmount)
          .times(amount)
          .div(2)
          .plus(amount)
          .dp(0);
        const orderUnitPrice = BigNumberJS(dUnitPrice)
          .times(midUnitPrice)
          .div(40)
          .plus(midUnitPrice)
          .dp(0);
        const orderSide = orderUnitPrice.gte(midUnitPrice.toString())
          ? Side.BORROW
          : Side.LEND;

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
            totalBorrowAmount = totalBorrowAmount.add(orderAmount.toFixed());
          } else {
            totalLendAmount = totalLendAmount.add(orderAmount.toFixed());
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
          const tokenAddress = await tokenVault.getTokenAddress(currency.key);
          const token = await ethers.getContractAt(ERC20_ABI, tokenAddress);

          const allowance = await token.allowance(
            owner.address,
            tokenVault.address,
          );

          if (allowance.lt(ethers.constants.MaxUint256)) {
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
          const tokenAddress = await tokenVault.getTokenAddress(currency.key);
          const token = await ethers.getContractAt(ERC20_ABI, tokenAddress);

          const allowance = await token.allowance(
            owner.address,
            tokenVault.address,
          );

          if (allowance.lt(ethers.constants.MaxUint256)) {
            await token
              .approve(tokenVault.address, ethers.constants.MaxUint256)
              .then((tx) => tx.wait());
          }
        }
      }

      const depositValue = totalBorrowAmount.mul(2);
      const depositValueInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](marketCurrencyName, depositValue);

      if (BigNumber.from(depositValueInETH).mul(2).lt(availableAmountInETH)) {
        console.log('Skipped deposit');
        console.log(
          'The current amount available is',
          availableAmountInETH.toString(),
        );
      } else {
        const depositValueInCollateralCurrency =
          await currencyController.convertFromETH(
            collateralCurrencyName,
            depositValueInETH,
          );

        console.log(
          'depositValueInCollateralCurrency:',
          depositValueInCollateralCurrency.toString(),
        );

        await tokenVault
          .deposit(collateralCurrencyName, depositValueInCollateralCurrency, {
            value:
              collateralCurrency === 'ETH'
                ? depositValueInCollateralCurrency
                : 0,
          })
          .then((tx) => tx.wait());

        console.log(
          `Successfully deposited ${depositValueInCollateralCurrency.toString()} in ${collateralCurrency}`,
        );
      }

      // Create orders
      for (const order of orders) {
        const msg = `> Creating an order... [${
          order.side === Side.LEND ? 'LEND' : 'BORROW'
        }, ${order.amount}, ${order.unitPrice}]`;
        process.stdout.write(msg);

        if (order.side === Side.LEND) {
          await lendingMarketController
            .depositAndCreateOrder(
              marketCurrencyName,
              maturity,
              order.side,
              order.amount,
              order.unitPrice,
              {
                value: marketCurrency === 'ETH' ? order.amount : 0,
              },
            )
            .then((tx) => tx.wait());
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

        process.stdout.write('\r\x1b[K');
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
        ...getOrderBookObject(borrowUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .sort((a, b) => (a.unitPrice.lte(b.unitPrice) ? -1 : 1))
          .map(({ unitPrice, amount, quantity }) => ({
            Borrow: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
        ...getOrderBookObject(lendUnitPrices)
          .filter(({ unitPrice }) => unitPrice.toString() !== '0')
          .map(({ unitPrice, amount, quantity }) => ({
            Lend: amount.toString(),
            UnitPrice: unitPrice.toString(),
            Quantity: quantity.toString(),
          })),
      ];

      console.log('Current order book is:');
      console.table(orderBook);
    },
  );
