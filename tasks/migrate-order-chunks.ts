import { BigNumber, BigNumberish, Contract } from 'ethers';
import { task } from 'hardhat/config';
import { Side } from '../utils/constants';
import { fromBytes32, toBytes32 } from '../utils/strings';

const PAGE_SIZE = 1000;

type OrderSide = {
  name: 'LEND' | 'BORROW';
  value: number;
  getter: 'getLendOrderBook' | 'getBorrowOrderBook';
};

const ORDER_SIDES: OrderSide[] = [
  { name: 'LEND', value: Side.LEND, getter: 'getLendOrderBook' },
  { name: 'BORROW', value: Side.BORROW, getter: 'getBorrowOrderBook' },
];

const getAllUnitPrices = async (
  lendingMarket: Contract,
  orderBookId: BigNumberish,
  getter: OrderSide['getter'],
): Promise<BigNumber[]> => {
  const allUnitPrices: BigNumber[] = [];
  let start = BigNumber.from(0);

  do {
    const { unitPrices, next } = await lendingMarket[getter](
      orderBookId,
      start,
      PAGE_SIZE,
    );

    allUnitPrices.push(
      ...unitPrices.filter((unitPrice: BigNumber) => !unitPrice.isZero()),
    );
    start = next;
  } while (!start.isZero());

  return allUnitPrices;
};

const hasErrorMessage = (
  error: unknown,
  message: string,
  visited = new WeakSet<object>(),
): boolean => {
  if (typeof error === 'string') {
    return error.includes(message);
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  if (visited.has(error)) {
    return false;
  }
  visited.add(error);

  if (error instanceof Error && error.message.includes(message)) {
    return true;
  }

  return Object.values(error).some((value) =>
    hasErrorMessage(value, message, visited),
  );
};

task(
  'migrate-order-chunks',
  'Migrate order chunks for every currency and order book',
).setAction(async (_, { deployments, ethers }) => {
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const [currencyController, lendingMarketController] = await Promise.all(
    ['CurrencyController', 'LendingMarketController'].map(async (name) => {
      const address = await proxyController.getAddress(toBytes32(name));
      return ethers.getContractAt(name, address);
    }),
  );

  const currencies: string[] = await currencyController.getCurrencies();
  let migratedCount = 0;
  let skippedCount = 0;

  for (const currency of currencies) {
    const currencyName = fromBytes32(currency);
    const [lendingMarketAddress, orderBookIds] = await Promise.all([
      lendingMarketController.getLendingMarket(currency),
      lendingMarketController.getOrderBookIds(currency),
    ]);
    const lendingMarket = await ethers.getContractAt(
      'LendingMarket',
      lendingMarketAddress,
    );

    for (const orderBookId of orderBookIds) {
      for (const side of ORDER_SIDES) {
        const unitPrices = await getAllUnitPrices(
          lendingMarket,
          orderBookId,
          side.getter,
        );

        for (const unitPrice of unitPrices) {
          const target = `${currencyName} order book ${orderBookId.toString()} ${
            side.name
          } @ ${unitPrice.toString()}`;

          try {
            await lendingMarket.callStatic.migrateOrderChunks(
              orderBookId,
              side.value,
              unitPrice,
            );
          } catch (error) {
            if (hasErrorMessage(error, 'Already migrated')) {
              skippedCount++;
              console.log(`Skipped already migrated ${target}`);
              continue;
            }
            throw error;
          }

          await lendingMarket
            .migrateOrderChunks(orderBookId, side.value, unitPrice)
            .then((tx) => tx.wait());
          migratedCount++;
          console.log(`Successfully migrated ${target}`);
        }
      }
    }
  }

  console.log(
    `Order chunk migration completed: ${migratedCount} migrated, ${skippedCount} skipped`,
  );
});
