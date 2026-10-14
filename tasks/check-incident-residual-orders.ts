import { BigNumber, Contract } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';

import { toBytes32 } from '../utils/strings';

const PAGE_SIZE = 100;

type Side = 'LEND' | 'BORROW';

interface PriceLevel {
  unitPrice: BigNumber;
  amount: BigNumber;
  quantity: BigNumber;
}

const fail = (message: string): never => {
  throw new HardhatPluginError('SecuredFinance', message);
};

const getPriceLevels = async (
  market: Contract,
  orderBookId: BigNumber,
  side: Side,
): Promise<PriceLevel[]> => {
  const getter = side === 'LEND' ? 'getLendOrderBook' : 'getBorrowOrderBook';
  const levels: PriceLevel[] = [];
  const visitedStarts = new Set<string>();
  let start = BigNumber.from(0);

  do {
    const startKey = start.toString();
    if (visitedStarts.has(startKey)) {
      fail(`Order-book pagination contains a cycle at unit price ${startKey}`);
    }
    visitedStarts.add(startKey);

    const page = await market[getter](orderBookId, start, PAGE_SIZE);
    for (let i = 0; i < page.unitPrices.length; i++) {
      if (page.unitPrices[i].isZero()) continue;
      levels.push({
        unitPrice: page.unitPrices[i],
        amount: page.amounts[i],
        quantity: page.quantities[i],
      });
    }
    start = page.next;
  } while (!start.isZero());

  return levels;
};

task(
  'check-incident-residual-orders',
  'Check whether orders remain on one side of an incident order book',
)
  .addParam('currency', 'Currency symbol', undefined, types.string)
  .addParam('maturity', 'Order-book maturity', undefined, types.string)
  .addParam('side', 'Order side: LEND or BORROW', undefined, types.string)
  .setAction(
    async (
      { currency, maturity, side: inputSide },
      { deployments, ethers },
    ) => {
      const side = inputSide.toUpperCase() as Side;
      if (side !== 'LEND' && side !== 'BORROW') {
        fail(`Invalid side ${inputSide}; expected LEND or BORROW`);
      }

      let parsedMaturity: BigNumber;
      try {
        parsedMaturity = BigNumber.from(maturity);
      } catch {
        fail(`Invalid maturity: ${maturity}`);
      }
      if (parsedMaturity!.lte(0)) fail(`Invalid maturity: ${maturity}`);

      const ccy = toBytes32(currency.toUpperCase());
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );
      const controllerAddress = await proxyController.getAddress(
        toBytes32('LendingMarketController'),
      );
      const controller = await ethers.getContractAt(
        'LendingMarketController',
        controllerAddress,
      );
      const orderBookId = BigNumber.from(
        await controller.getOrderBookId(ccy, parsedMaturity!),
      );
      if (orderBookId.isZero()) {
        fail(`No order book exists for ${currency} maturity ${maturity}`);
      }

      const marketAddress = await controller.getLendingMarket(ccy);
      const market = await ethers.getContractAt('LendingMarket', marketAddress);
      const levels = await getPriceLevels(market, orderBookId, side);
      const totalOrders = levels.reduce(
        (total, level) => total.add(level.quantity),
        BigNumber.from(0),
      );
      const status = levels.length === 0 ? 'COMPLETED' : 'NOT_RECOVERED';

      console.table([
        {
          status,
          currency: currency.toUpperCase(),
          maturity: parsedMaturity!.toString(),
          side,
          orderBookId: orderBookId.toString(),
          priceLevels: levels.length,
          orders: totalOrders.toString(),
        },
      ]);

      if (levels.length > 0) {
        console.table(
          levels.map(({ unitPrice, amount, quantity }) => ({
            unitPrice: unitPrice.toString(),
            amount: amount.toString(),
            quantity: quantity.toString(),
          })),
        );
      }

      return { status, levels };
    },
  );

export { getPriceLevels };
