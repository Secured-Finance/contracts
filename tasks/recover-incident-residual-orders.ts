import { BigNumber, Contract } from 'ethers';
import { readFileSync } from 'fs';
import { task } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { resolve } from 'path';

import { Proposal } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

type Side = 'LEND' | 'BORROW';

interface ResidualOrderInput {
  orderId: string;
  unitPrice: string;
  maker: string;
  amount: string;
}

interface ResidualTreeInput {
  currency: string;
  orderBookId: string;
  maturity: string;
  side: Side;
  expectedRoot: string;
  orders: ResidualOrderInput[];
}

interface IncidentFillReversalInput {
  recoveryId: string;
  sourceTransactionHash: string;
  currency: string;
  maturity: string;
  orderId: string;
  taker: string;
  maker: string;
  originalTakerSide: Side;
  amount: string;
  amountInFV: string;
  expectedTakerDeposit: string;
  expectedTakerFutureValue: string;
  expectedMakerDeposit: string;
  expectedMakerFutureValue: string;
}

interface IncidentRecoveryData {
  version: 1;
  network: string;
  chainId: string;
  referenceBlock: string;
  residualTrees: ResidualTreeInput[];
  incidentFillReversal: IncidentFillReversalInput | null;
}

interface PlannedCall {
  description: string;
  to: string;
  data: string;
  value: string;
}

const MANIFEST_FILE = 'order-book-incident-residual.json';
const UINT48_MAX = BigNumber.from(2).pow(48).sub(1);
const UINT8_MAX = BigNumber.from(2).pow(8).sub(1);
const INT256_MAX = BigNumber.from(2).pow(255).sub(1);
const INT256_MIN = BigNumber.from(2).pow(255).mul(-1);

const fail = (message: string): never => {
  throw new HardhatPluginError('SecuredFinance', message);
};

const requireAddress = (ethers: any, label: string, value: string) => {
  if (
    typeof value !== 'string' ||
    !ethers.utils.isAddress(value) ||
    value === ethers.constants.AddressZero
  ) {
    fail(`${label} is not a valid non-zero address: ${value}`);
  }
};

const requireId = (ethers: any, label: string, value: string) => {
  if (
    typeof value !== 'string' ||
    !ethers.utils.isHexString(value, 32) ||
    value === ethers.constants.HashZero
  ) {
    fail(`${label} must be an explicit non-zero bytes32 value`);
  }
};

const requireCurrency = (label: string, value: string) => {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9]*$/.test(value)) {
    fail(`${label} is not a valid currency symbol: ${value}`);
  }
};

const requireUint = (
  label: string,
  value: string,
  maximum?: BigNumber,
): BigNumber => {
  let parsed: BigNumber;
  try {
    parsed = BigNumber.from(value);
  } catch {
    fail(`${label} is not an integer: ${value}`);
  }
  if (parsed!.lt(0) || (maximum && parsed!.gt(maximum))) {
    fail(`${label} is outside its allowed range: ${value}`);
  }
  return parsed!;
};

const requirePositiveUint = (
  label: string,
  value: string,
  maximum?: BigNumber,
): BigNumber => {
  const parsed = requireUint(label, value, maximum);
  if (parsed.isZero()) fail(`${label} must be greater than zero`);
  return parsed;
};

const requireInt256 = (label: string, value: string) => {
  let parsed: BigNumber;
  try {
    parsed = BigNumber.from(value);
  } catch {
    fail(`${label} is not an integer: ${value}`);
  }
  if (parsed!.lt(INT256_MIN) || parsed!.gt(INT256_MAX)) {
    fail(`${label} is outside the int256 range: ${value}`);
  }
};

const validateSide = (label: string, side: string): Side => {
  if (side !== 'LEND' && side !== 'BORROW') {
    fail(`${label} must be LEND or BORROW: ${side}`);
  }
  return side as Side;
};

const sideValue = (side: Side) => (side === 'LEND' ? 0 : 1);

const readRecoveryData = (
  root: string,
  network: string,
): IncidentRecoveryData => {
  const path = resolve(root, 'recovery-data', network, MANIFEST_FILE);
  let data: IncidentRecoveryData;
  try {
    data = JSON.parse(readFileSync(path, 'utf8')) as IncidentRecoveryData;
  } catch (error) {
    fail(`Unable to read recovery manifest ${path}: ${String(error)}`);
  }

  if (data!.version !== 1) fail('Unsupported recovery data version');
  if (data!.network !== network) {
    fail(`Recovery data network ${data!.network} does not match ${network}`);
  }
  if (!Array.isArray(data!.residualTrees)) {
    fail('Recovery data must contain a residualTrees array');
  }
  if (data!.residualTrees.length === 0 && !data!.incidentFillReversal) {
    fail('Recovery data contains no operations');
  }
  return data!;
};

const validateRecoveryData = (ethers: any, data: IncidentRecoveryData) => {
  requirePositiveUint('referenceBlock', data.referenceBlock);
  const seenTrees = new Set<string>();

  for (const [treeIndex, tree] of data.residualTrees.entries()) {
    const label = `residualTrees[${treeIndex}]`;
    requireCurrency(`${label}.currency`, tree.currency);
    requirePositiveUint(`${label}.orderBookId`, tree.orderBookId, UINT8_MAX);
    requirePositiveUint(`${label}.maturity`, tree.maturity);
    validateSide(`${label}.side`, tree.side);
    requirePositiveUint(`${label}.expectedRoot`, tree.expectedRoot);
    if (!Array.isArray(tree.orders) || tree.orders.length === 0) {
      fail(`${label}.orders must contain at least one order`);
    }

    const treeKey = [
      tree.currency,
      tree.orderBookId,
      tree.maturity,
      tree.side,
    ].join(':');
    if (seenTrees.has(treeKey)) fail(`Duplicate residual tree: ${treeKey}`);
    seenTrees.add(treeKey);

    const seenOrderIds = new Set<string>();
    const seenUnitPrices = new Set<string>();
    let includesRoot = false;
    for (const [orderIndex, order] of tree.orders.entries()) {
      const orderLabel = `${label}.orders[${orderIndex}]`;
      requirePositiveUint(`${orderLabel}.orderId`, order.orderId, UINT48_MAX);
      requirePositiveUint(`${orderLabel}.unitPrice`, order.unitPrice);
      requireAddress(ethers, `${orderLabel}.maker`, order.maker);
      requirePositiveUint(`${orderLabel}.amount`, order.amount);
      if (seenOrderIds.has(order.orderId)) {
        fail(`Duplicate order ID in ${label}: ${order.orderId}`);
      }
      if (seenUnitPrices.has(order.unitPrice)) {
        fail(`Duplicate unit price in ${label}: ${order.unitPrice}`);
      }
      seenOrderIds.add(order.orderId);
      seenUnitPrices.add(order.unitPrice);
      includesRoot ||= order.unitPrice === tree.expectedRoot;
    }
    if (!includesRoot) {
      fail(`${label}.expectedRoot must be included in its orders`);
    }
  }

  const fill = data.incidentFillReversal;
  if (!fill) return;
  requireId(ethers, 'incidentFillReversal.recoveryId', fill.recoveryId);
  requireId(
    ethers,
    'incidentFillReversal.sourceTransactionHash',
    fill.sourceTransactionHash,
  );
  requireCurrency('incidentFillReversal.currency', fill.currency);
  requirePositiveUint('incidentFillReversal.maturity', fill.maturity);
  requirePositiveUint('incidentFillReversal.orderId', fill.orderId, UINT48_MAX);
  requireAddress(ethers, 'incidentFillReversal.taker', fill.taker);
  requireAddress(ethers, 'incidentFillReversal.maker', fill.maker);
  if (
    ethers.utils.getAddress(fill.taker) === ethers.utils.getAddress(fill.maker)
  ) {
    fail('incidentFillReversal taker and maker must be different');
  }
  validateSide(
    'incidentFillReversal.originalTakerSide',
    fill.originalTakerSide,
  );
  requirePositiveUint('incidentFillReversal.amount', fill.amount);
  requirePositiveUint('incidentFillReversal.amountInFV', fill.amountInFV);
  requireUint(
    'incidentFillReversal.expectedTakerDeposit',
    fill.expectedTakerDeposit,
  );
  requireInt256(
    'incidentFillReversal.expectedTakerFutureValue',
    fill.expectedTakerFutureValue,
  );
  requireUint(
    'incidentFillReversal.expectedMakerDeposit',
    fill.expectedMakerDeposit,
  );
  requireInt256(
    'incidentFillReversal.expectedMakerFutureValue',
    fill.expectedMakerFutureValue,
  );
};

const assertAddressEqual = (
  ethers: any,
  label: string,
  actual: string,
  expected: string,
) => {
  if (ethers.utils.getAddress(actual) !== ethers.utils.getAddress(expected)) {
    fail(`${label} mismatch: expected ${expected}, found ${actual}`);
  }
};

const simulateCall = async (ethers: any, caller: string, call: PlannedCall) => {
  try {
    await ethers.provider.call({
      from: caller,
      to: call.to,
      data: call.data,
      value: call.value,
    });
  } catch (error) {
    fail(
      `Pre-execution simulation failed for ${call.description}: ${String(
        error,
      )}`,
    );
  }
};

task(
  'recover-incident-residual-orders',
  'Execute or propose the reviewed incident residual-order recovery manifest',
).setAction(async (_, { config, deployments, ethers, getChainId, network }) => {
  const data = readRecoveryData(config.paths.root, network.name);
  validateRecoveryData(ethers, data);

  const chainId = await getChainId();
  if (data.chainId !== chainId) {
    fail(
      `Recovery data chainId ${data.chainId} does not match connected chain ${chainId}`,
    );
  }
  if ((await ethers.provider.getBlockNumber()) < Number(data.referenceBlock)) {
    fail(`Connected chain is behind reference block ${data.referenceBlock}`);
  }
  if (data.incidentFillReversal && chainId !== '314') {
    fail('Incident fill reversal is only approved for Filecoin mainnet');
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) fail('No execution signer is available');
  const deployerAddress = await deployer.getAddress();
  const directExecution = process.env.ENABLE_AUTO_UPDATE === 'true';
  const executionCaller = process.env.SAFE_WALLET_ADDRESS ?? '';
  requireAddress(ethers, 'execution caller', executionCaller);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const [controllerAddress, tokenVaultAddress] = await Promise.all([
    proxyController.getAddress(toBytes32('LendingMarketController')),
    proxyController.getAddress(toBytes32('TokenVault')),
  ]);
  const [controller, tokenVault] = await Promise.all([
    ethers.getContractAt('LendingMarketController', controllerAddress),
    ethers.getContractAt('TokenVault', tokenVaultAddress),
  ]);
  const controllerOperatorRole = await controller.OPERATOR_ROLE();
  if (
    data.residualTrees.length > 0 &&
    ethers.utils.getAddress(await controller.owner()) !==
      ethers.utils.getAddress(executionCaller)
  ) {
    fail('Execution caller is not the Controller owner');
  }

  const calls: PlannedCall[] = [];
  const marketCache = new Map<string, Contract>();
  for (const tree of data.residualTrees) {
    const ccy = toBytes32(tree.currency);
    const configuredOrderBookId = await controller.getOrderBookId(
      ccy,
      tree.maturity,
    );
    if (configuredOrderBookId.toString() !== tree.orderBookId) {
      fail(
        `${tree.currency} ${tree.maturity} orderBookId mismatch: expected ${
          tree.orderBookId
        }, found ${configuredOrderBookId.toString()}`,
      );
    }

    let market = marketCache.get(tree.currency);
    if (!market) {
      const marketAddress = await controller.getLendingMarket(ccy);
      requireAddress(ethers, `${tree.currency} LendingMarket`, marketAddress);
      market = await ethers.getContractAt('LendingMarket', marketAddress);
      marketCache.set(tree.currency, market);
    }
    if (!(await market.paused())) {
      fail(`${tree.currency} LendingMarket is not paused`);
    }

    for (const order of tree.orders) {
      const current = await market.getOrder(tree.orderBookId, order.orderId);
      if (
        Number(current.side) !== sideValue(tree.side) ||
        !current.unitPrice.eq(order.unitPrice) ||
        !current.maturity.eq(tree.maturity) ||
        ethers.utils.getAddress(current.maker) !==
          ethers.utils.getAddress(order.maker) ||
        !current.amount.eq(order.amount)
      ) {
        fail(
          `Unexpected order state for ${tree.currency} order ${order.orderId}`,
        );
      }
      const orderIds =
        tree.side === 'LEND'
          ? await market.getLendOrderIds(tree.orderBookId, order.maker)
          : await market.getBorrowOrderIds(tree.orderBookId, order.maker);
      if (orderIds.activeOrderIds.length || orderIds.inActiveOrderIds.length) {
        fail(
          `${tree.currency} order ${order.orderId} maker order arrays are not empty`,
        );
      }
    }

    const visibleBook =
      tree.side === 'LEND'
        ? await market.getLendOrderBook(
            tree.orderBookId,
            0,
            tree.orders.length + 1,
          )
        : await market.getBorrowOrderBook(
            tree.orderBookId,
            0,
            tree.orders.length + 1,
          );
    const visiblePrices = visibleBook.unitPrices
      .filter((price: BigNumber) => !price.isZero())
      .map((price: BigNumber) => price.toString())
      .sort();
    const expectedPrices = tree.orders.map(({ unitPrice }) => unitPrice).sort();
    if (JSON.stringify(visiblePrices) !== JSON.stringify(expectedPrices)) {
      fail(
        `${tree.currency} ${tree.maturity} visible order-book prices do not match the manifest`,
      );
    }

    calls.push({
      description: `recover ${tree.currency} ${tree.maturity} ${tree.side} residual tree`,
      to: controller.address,
      data: controller.interface.encodeFunctionData(
        'recoverIncidentResidualOrders',
        [
          ccy,
          tree.orderBookId,
          tree.maturity,
          sideValue(tree.side),
          tree.expectedRoot,
          tree.orders,
        ],
      ),
      value: '0',
    });
  }

  const fill = data.incidentFillReversal;
  if (fill) {
    const configuredRecoveryAddress =
      process.env.INCIDENT_FILL_RECOVERY_ADDRESS ??
      (await deployments.get('OrderBookIncidentFillRecovery')).address;
    requireAddress(
      ethers,
      'OrderBookIncidentFillRecovery',
      configuredRecoveryAddress,
    );
    const recovery = await ethers.getContractAt(
      'OrderBookIncidentFillRecovery',
      configuredRecoveryAddress,
    );
    assertAddressEqual(
      ethers,
      'Recovery Controller',
      await recovery.lendingMarketController(),
      controllerAddress,
    );
    assertAddressEqual(
      ethers,
      'Recovery TokenVault',
      await recovery.tokenVault(),
      tokenVaultAddress,
    );
    assertAddressEqual(
      ethers,
      'Recovery owner',
      await recovery.owner(),
      executionCaller,
    );
    if (await recovery.executedRecoveries(fill.recoveryId)) {
      fail(`Recovery ${fill.recoveryId} has already been executed`);
    }
    if (!(await tokenVault.paused())) fail('TokenVault is not paused');
    if (
      !(await controller.hasRole(
        controllerOperatorRole,
        configuredRecoveryAddress,
      ))
    ) {
      fail('Fill recovery contract does not have the Controller Operator role');
    }
    const tokenVaultOperatorRole = await tokenVault.OPERATOR_ROLE();
    if (
      !(await tokenVault.hasRole(
        tokenVaultOperatorRole,
        configuredRecoveryAddress,
      ))
    ) {
      fail('Fill recovery contract does not have the TokenVault Operator role');
    }

    calls.push({
      description: `reverse incident fill ${fill.sourceTransactionHash} order ${fill.orderId}`,
      to: recovery.address,
      data: recovery.interface.encodeFunctionData(
        'executeIncidentOrderFillReversal',
        [
          fill.recoveryId,
          {
            ccy: toBytes32(fill.currency),
            maturity: fill.maturity,
            orderId: fill.orderId,
            taker: fill.taker,
            maker: fill.maker,
            originalTakerSide: sideValue(fill.originalTakerSide),
            amount: fill.amount,
            amountInFV: fill.amountInFV,
          },
          fill.expectedTakerDeposit,
          fill.expectedTakerFutureValue,
          fill.expectedMakerDeposit,
          fill.expectedMakerFutureValue,
        ],
      ),
      value: '0',
    });
  }

  for (const call of calls) {
    await simulateCall(ethers, executionCaller, call);
  }

  console.table(
    calls.map(({ description, to, value }) => ({
      description,
      to,
      value,
    })),
  );

  if (directExecution) {
    const executionSigner = ethers.provider.getSigner(executionCaller);
    for (const call of calls) {
      await executionSigner
        .sendTransaction({ to: call.to, data: call.data, value: call.value })
        .then((transaction) => transaction.wait());
    }
    return;
  }

  const proposal = await Proposal.create(network.provider, deployerAddress);
  for (const call of calls) {
    await proposal.add(call.to, call.data, call.value);
  }
  await proposal.submit();
});

export {
  IncidentFillReversalInput,
  IncidentRecoveryData,
  MANIFEST_FILE,
  ResidualTreeInput,
};
